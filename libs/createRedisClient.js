const redis = require("redis");

module.exports = function createRedisClient(redisConfig) {
    // Determine if we are using a socket or host/port for Redis connection
    const useSocket =
        typeof redisConfig.socket !== "undefined" && redisConfig.socket !== "";
    let clientOptions = {};

    if (useSocket) {
        clientOptions.socket = {
            path: redisConfig.socket,
        };
    } else {
        clientOptions.url = `redis://${redisConfig.host}:${redisConfig.port}`;
    }

    // Include password in options if it's provided in the config
    if (redisConfig.password && redisConfig.password !== "") {
        clientOptions.password = redisConfig.password;
    }

    const client = redis.createClient(clientOptions);
    client.snompEndpoint = useSocket
        ? redisConfig.socket
        : `${redisConfig.host}:${redisConfig.port}`;

    // Listen for connection errors
    client.on("error", (err) => console.log("Redis Client Error", err));

    // Connect to Redis
    client
        .connect()
        .catch((err) => console.error("Redis connection error:", err));

    return client;
};
