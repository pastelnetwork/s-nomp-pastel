var fs = require("fs");
var path = require("path");
var os = require("os");
var cluster = require("cluster");

var async = require("async");
var extend = require("extend");

var redis = require("redis");

var initializeLogger = require("./libs/logUtil.js"); // This correctly imports the async initializeLogger function
var CliListener = require("./libs/cliListener.js");
var PoolWorker = require("./libs/poolWorker.js");
var PaymentProcessor = require("./libs/paymentProcessor.js");
var Website = require("./libs/website.js");
var ProfitSwitch = require("./libs/profitSwitch.js");
var CreateRedisClient = require("./libs/createRedisClient.js");

var algos = require("stratum-pool/lib/algoProperties.js");

JSON.minify = JSON.minify || require("node-json-minify");

if (!fs.existsSync("config.json")) {
    console.log(
        "config.json file does not exist. Read the installation/setup instructions.",
    );
    return;
}

var portalConfig = JSON.parse(
    JSON.minify(fs.readFileSync("config.json", { encoding: "utf8" })),
);
var poolConfigs;

initializeLogger({
    logLevel: portalConfig.logLevel,
    logColors: portalConfig.logColors,
})
    .then((logger) => {
        startApplication(logger); // Moved all logic that depends on logger into this function
    })
    .catch((err) => {
        console.error("Failed to initialize logger:", err);
    });

function startApplication(logger) {
    // Application initialization logic goes here

    //Try to give process ability to handle 100k concurrent connections
    try {
        var posix = require("posix");
        try {
            posix.setrlimit("nofile", { soft: 100000, hard: 100000 });
        } catch (e) {
            if (cluster.isMaster)
                logger.warning(
                    "POSIX",
                    "Connection Limit",
                    "(Safe to ignore) Must be ran as root to increase resource limits",
                );
        } finally {
            // Find out which user used sudo through the environment variable
            var uid = parseInt(process.env.SUDO_UID);
            // Set our server's uid to that user
            if (uid) {
                process.setuid(uid);
                logger.debug(
                    "POSIX",
                    "Connection Limit",
                    "Raised to 100K concurrent connections, now running as non-root user: " +
                        process.getuid(),
                );
            }
        }
    } catch (e) {
        if (cluster.isMaster)
            logger.debug(
                "POSIX",
                "Connection Limit",
                "(Safe to ignore) POSIX module not installed and resource (connection) limit was not raised",
            );
    }

    if (cluster.isWorker) {
        switch (process.env.workerType) {
            case "pool":
                new PoolWorker(logger);
                break;
            case "paymentProcessor":
                new PaymentProcessor(logger);
                break;
            case "website":
                new Website(logger);
                break;
            case "profitSwitch":
                new ProfitSwitch(logger);
                break;
        }

        return;
    }

    //Read all pool configs from pool_configs and join them with their coin profile
    var buildPoolConfigs = function () {
        return new Promise((resolve, reject) => {
            var configs = {};
            var configDir = "pool_configs/";
            logger.debug(
                "Master",
                "PoolSpawner",
                "Reading pool configurations from: " + configDir,
            );

            fs.readdir(configDir, (err, files) => {
                if (err) {
                    logger.error(
                        "Master",
                        "PoolSpawner",
                        "Error reading pool_configs directory: " + err,
                    );
                    return reject(err);
                }

                var poolConfigFiles = files.filter(
                    (file) => path.extname(file) === ".json",
                );

                poolConfigFiles.forEach((file) => {
                    var filePath = path.join(configDir, file);
                    try {
                        var poolOptions = JSON.parse(
                            JSON.minify(
                                fs.readFileSync(filePath, { encoding: "utf8" }),
                            ),
                        );
                        if (!poolOptions.enabled) return;

                        poolOptions.fileName = file;
                        var coinFilePath = path.join("coins", poolOptions.coin);

                        if (!fs.existsSync(coinFilePath)) {
                            logger.error(
                                "Master",
                                poolOptions.fileName,
                                "Coin file not found: " + coinFilePath,
                            );
                            return;
                        }

                        var coinProfile = JSON.parse(
                            JSON.minify(
                                fs.readFileSync(coinFilePath, {
                                    encoding: "utf8",
                                }),
                            ),
                        );
                        poolOptions.coin = coinProfile;
                        poolOptions.coin.name =
                            poolOptions.coin.name.toLowerCase();

                        if (poolOptions.coin.name in configs) {
                            logger.error(
                                "Master",
                                poolOptions.fileName,
                                "Duplicate coin name detected: " +
                                    poolOptions.coin.name,
                            );
                            return reject(
                                new Error(
                                    "Duplicate coin name: " +
                                        poolOptions.coin.name,
                                ),
                            );
                        }

                        // Check for port conflicts
                        var portsUsed = new Set();
                        Object.keys(poolOptions.ports || {}).forEach((port) => {
                            if (portsUsed.has(port)) {
                                logger.error(
                                    "Master",
                                    poolOptions.fileName,
                                    "Port conflict detected for port: " + port,
                                );
                                return reject(
                                    new Error("Port conflict: " + port),
                                );
                            }
                            portsUsed.add(port);
                        });

                        configs[poolOptions.coin.name] = poolOptions;
                    } catch (e) {
                        logger.error(
                            "Master",
                            "PoolSpawner",
                            `Error processing file ${file}: ${e}`,
                        );
                        return reject(e);
                    }
                });

                if (Object.keys(configs).length === 0) {
                    return reject(
                        new Error("No valid pool configurations found."),
                    );
                }

                logger.debug(
                    "Master",
                    "PoolSpawner",
                    "Final pool configurations: ",
                    configs,
                );
                resolve(configs);
            });
        });
    };

    function roundTo(n, digits) {
        if (digits === undefined) {
            digits = 0;
        }
        var multiplicator = Math.pow(10, digits);
        n = parseFloat((n * multiplicator).toFixed(11));
        var test = Math.round(n) / multiplicator;
        return +test.toFixed(digits);
    }

    var _lastStartTimes = [];
    var _lastShareTimes = [];

    var spawnPoolWorkers = function () {
        var connection;

        Object.keys(poolConfigs).forEach(function (coin) {
            var pcfg = poolConfigs[coin];
            if (!Array.isArray(pcfg.daemons) || pcfg.daemons.length < 1) {
                logger.error(
                    "Master",
                    coin,
                    "No daemons configured so a pool cannot be started for this coin.",
                );
                delete poolConfigs[coin];
            } else if (!connection) {
                connection = CreateRedisClient(pcfg.redis);
                // Note: Error handling is set up in CreateRedisClient
            }
        });

        if (Object.keys(poolConfigs).length === 0) {
            logger.warning(
                "Master",
                "PoolSpawner",
                "No pool configs exist or are enabled in pool_configs folder. No pools spawned.",
            );
            return;
        }

        var serializedConfigs = JSON.stringify(poolConfigs);
        var numForks =
            portalConfig.clustering && portalConfig.clustering.enabled
                ? portalConfig.clustering.forks === "auto"
                    ? os.cpus().length
                    : parseInt(portalConfig.clustering.forks) || 1
                : 1;

        for (let i = 0; i < numForks; i++) {
            createPoolWorker(i);
        }
    };

    var serializedConfigs = JSON.stringify(poolConfigs);

    var numForks = (function () {
        if (!portalConfig.clustering || !portalConfig.clustering.enabled)
            return 1;
        if (portalConfig.clustering.forks === "auto") return os.cpus().length;
        if (
            !portalConfig.clustering.forks ||
            isNaN(portalConfig.clustering.forks)
        )
            return 1;
        return portalConfig.clustering.forks;
    })();

    var poolWorkers = {};

    var createPoolWorker = function (forkId) {
        var worker = cluster.fork({
            workerType: "pool",
            forkId: forkId,
            pools: serializedConfigs,
            portalConfig: JSON.stringify(portalConfig),
        });

        worker.on("exit", function () {
            logger.error(
                "Master",
                "PoolSpawner",
                "Fork " + forkId + " died, spawning replacement worker...",
            );
            setTimeout(function () {
                createPoolWorker(forkId);
            }, 2000);
        });

        worker.on("message", function (msg) {
            switch (msg.type) {
                case "banIP":
                    Object.keys(cluster.workers).forEach(function (id) {
                        if (cluster.workers[id].type === "pool") {
                            cluster.workers[id].send({
                                type: "banIP",
                                ip: msg.ip,
                            });
                        }
                    });
                    break;
                case "shareTrack":
                    // pplnt time share tracking of workers
                    if (msg.isValidShare && !msg.isValidBlock) {
                        var now = Date.now();
                        var lastShareTime = now;
                        var lastStartTime = now;
                        var workerAddress = msg.data.worker.split(".")[0];

                        // if needed, initialize PPLNT objects for coin
                        if (!_lastShareTimes[msg.coin]) {
                            _lastShareTimes[msg.coin] = {};
                        }
                        if (!_lastStartTimes[msg.coin]) {
                            _lastStartTimes[msg.coin] = {};
                        }

                        // did they just join in this round?
                        if (
                            !_lastShareTimes[msg.coin][workerAddress] ||
                            !_lastStartTimes[msg.coin][workerAddress]
                        ) {
                            _lastShareTimes[msg.coin][workerAddress] = now;
                            _lastStartTimes[msg.coin][workerAddress] = now;
                            logger.debug(
                                "PPLNT",
                                msg.coin,
                                "Thread " + msg.thread,
                                workerAddress + " joined.",
                            );
                        }
                        // grab last times from memory objects
                        if (
                            _lastShareTimes[msg.coin][workerAddress] != null &&
                            _lastShareTimes[msg.coin][workerAddress] > 0
                        ) {
                            lastShareTime =
                                _lastShareTimes[msg.coin][workerAddress];
                            lastStartTime =
                                _lastStartTimes[msg.coin][workerAddress];
                        }

                        var redisCommands = [];

                        // if its been less than 15 minutes since last share was submitted
                        var timeChangeSec = roundTo(
                            Math.max(now - lastShareTime, 0) / 1000,
                            4,
                        );
                        //var timeChangeTotal = roundTo(Math.max(now - lastStartTime, 0) / 1000, 4);
                        if (timeChangeSec < 900) {
                            // loyal miner keeps mining :)
                            redisCommands.push([
                                "hincrbyfloat",
                                msg.coin + ":shares:timesCurrent",
                                workerAddress +
                                    "." +
                                    poolConfigs[msg.coin].poolId,
                                timeChangeSec,
                            ]);
                            //logger.debug('PPLNT', msg.coin, 'Thread '+msg.thread, workerAddress+':{totalTimeSec:'+timeChangeTotal+', timeChangeSec:'+timeChangeSec+'}');
                            connection
                                .multi(redisCommands)
                                .exec(function (err, replies) {
                                    if (err)
                                        logger.error(
                                            "PPLNT",
                                            msg.coin,
                                            "Thread " + msg.thread,
                                            "Error with time share processor call to redis " +
                                                JSON.stringify(err),
                                        );
                                });
                        } else {
                            // they just re-joined the pool
                            _lastStartTimes[workerAddress] = now;
                            logger.debug(
                                "PPLNT",
                                msg.coin,
                                "Thread " + msg.thread,
                                workerAddress + " re-joined.",
                            );
                        }

                        // track last time share
                        _lastShareTimes[msg.coin][workerAddress] = now;
                    }
                    if (msg.isValidBlock) {
                        // reset pplnt share times for next round
                        _lastShareTimes[msg.coin] = {};
                        _lastStartTimes[msg.coin] = {};
                    }
                    break;
            }
        });
    };

    var startCliListener = function () {
        var cliPort = portalConfig.cliPort;
        var cliServer = portalConfig.cliServer || "127.0.0.1";

        var listener = new CliListener(cliServer, cliPort);
        listener
            .on("log", function (text) {
                logger.debug("Master", "CLI", text);
            })
            .on("command", function (command, params, options, reply) {
                switch (command) {
                    case "blocknotify":
                        Object.keys(cluster.workers).forEach(function (id) {
                            cluster.workers[id].send({
                                type: "blocknotify",
                                coin: params[0],
                                hash: params[1],
                            });
                        });
                        reply("Pool workers notified");
                        break;
                    case "coinswitch":
                        processCoinSwitchCommand(params, options, reply);
                        break;
                    case "reloadpool":
                        Object.keys(cluster.workers).forEach(function (id) {
                            cluster.workers[id].send({
                                type: "reloadpool",
                                coin: params[0],
                            });
                        });
                        reply("reloaded pool " + params[0]);
                        break;
                    default:
                        reply('unrecognized command "' + command + '"');
                        break;
                }
            })
            .start();
    };

    var processCoinSwitchCommand = function (params, options, reply) {
        var logSystem = "CLI";
        var logComponent = "coinswitch";

        var replyError = function (msg) {
            reply(msg);
            logger.error(logSystem, logComponent, msg);
        };

        if (!params[0]) {
            replyError("Coin name required");
            return;
        }

        if (!params[1] && !options.algorithm) {
            replyError(
                "If switch key is not provided then algorithm options must be specified",
            );
            return;
        } else if (params[1] && !portalConfig.switching[params[1]]) {
            replyError("Switch key not recognized: " + params[1]);
            return;
        } else if (
            options.algorithm &&
            !Object.keys(portalConfig.switching).filter(function (s) {
                return (
                    portalConfig.switching[s].algorithm === options.algorithm
                );
            })[0]
        ) {
            replyError(
                "No switching options contain the algorithm " +
                    options.algorithm,
            );
            return;
        }

        var messageCoin = params[0].toLowerCase();
        var newCoin = Object.keys(poolConfigs).filter(function (p) {
            return p.toLowerCase() === messageCoin;
        })[0];

        if (!newCoin) {
            replyError(
                "Switch message to coin that is not recognized: " + messageCoin,
            );
            return;
        }

        var switchNames = [];

        if (params[1]) {
            switchNames.push(params[1]);
        } else {
            for (var name in portalConfig.switching) {
                if (
                    portalConfig.switching[name].enabled &&
                    portalConfig.switching[name].algorithm === options.algorithm
                )
                    switchNames.push(name);
            }
        }

        switchNames.forEach(function (name) {
            if (
                poolConfigs[newCoin].coin.algorithm !==
                portalConfig.switching[name].algorithm
            ) {
                replyError(
                    "Cannot switch a " +
                        portalConfig.switching[name].algorithm +
                        " algo pool to coin " +
                        newCoin +
                        " with " +
                        poolConfigs[newCoin].coin.algorithm +
                        " algo",
                );
                return;
            }

            Object.keys(cluster.workers).forEach(function (id) {
                cluster.workers[id].send({
                    type: "coinswitch",
                    coin: newCoin,
                    switchName: name,
                });
            });
        });

        reply("Switch message sent to pool workers");
    };

    var startPaymentProcessor = function () {
        var enabledForAny = false;
        for (var pool in poolConfigs) {
            var p = poolConfigs[pool];
            var enabled =
                p.enabled && p.paymentProcessing && p.paymentProcessing.enabled;
            if (enabled) {
                enabledForAny = true;
                break;
            }
        }

        if (!enabledForAny) return;

        var worker = cluster.fork({
            workerType: "paymentProcessor",
            pools: JSON.stringify(poolConfigs),
        });
        worker.on("exit", function (code, signal) {
            logger.error(
                "Master",
                "Payment Processor",
                "Payment processor died, spawning replacement...",
            );
            setTimeout(function () {
                startPaymentProcessor(poolConfigs);
            }, 2000);
        });
    };

    var startWebsite = function () {
        if (!portalConfig.website.enabled) return;

        var worker = cluster.fork({
            workerType: "website",
            pools: JSON.stringify(poolConfigs),
            portalConfig: JSON.stringify(portalConfig),
        });
        worker.on("exit", function (code, signal) {
            logger.error(
                "Master",
                "Website",
                "Website process died, spawning replacement...",
            );
            setTimeout(function () {
                startWebsite(portalConfig, poolConfigs);
            }, 2000);
        });
    };

    var startProfitSwitch = function () {
        if (!portalConfig.profitSwitch || !portalConfig.profitSwitch.enabled) {
            //logger.error('Master', 'Profit', 'Profit auto switching disabled');
            return;
        }

        var worker = cluster.fork({
            workerType: "profitSwitch",
            pools: JSON.stringify(poolConfigs),
            portalConfig: JSON.stringify(portalConfig),
        });
        worker.on("exit", function (code, signal) {
            logger.error(
                "Master",
                "Profit",
                "Profit switching process died, spawning replacement...",
            );
            setTimeout(function () {
                startWebsite(portalConfig, poolConfigs);
            }, 2000);
        });

        buildPoolConfigs()
            .then((configs) => {
                poolConfigs = configs; // Assign the loaded configs to the global poolConfigs variable
                logger.debug(
                    "Master",
                    "PoolSpawner",
                    "Pool configurations loaded successfully.",
                );

                // Now that poolConfigs is populated, you can spawn pool workers and proceed with other initialization tasks

                var i = 0;
                var spawnInterval = setInterval(function () {
                    createPoolWorker(i);
                    i++;
                    if (i === numForks) {
                        clearInterval(spawnInterval);
                        logger.debug(
                            "Master",
                            "PoolSpawner",
                            "Spawned " +
                                Object.keys(poolConfigs).length +
                                " pool(s) on " +
                                numForks +
                                " thread(s)",
                        );
                    }
                }, 250);

                spawnPoolWorkers();

                startPaymentProcessor();

                startWebsite();

                startProfitSwitch();

                startCliListener();
            })
            .catch((error) => {
                // Handle errors that occurred during pool configuration loading
                logger.error(
                    "Master",
                    "PoolSpawner",
                    "Failed to load pool configurations: " + error,
                );
                // Consider exiting or handling the error gracefully here
            });
    };
}
