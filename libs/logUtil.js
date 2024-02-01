var colors = require("colors");

function formatDate(date) {
    const pad = (num) => (num < 10 ? "0" + num : num.toString());

    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1); // Months are 0-based
    const day = pad(date.getDate());
    const hour = pad(date.getHours());
    const minute = pad(date.getMinutes());
    const second = pad(date.getSeconds());

    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

var severityToColor = function (severity, text) {
    switch (severity) {
        case "special":
            return text.cyan.underline;
        case "debug":
            return text.green;
        case "warning":
            return text.yellow;
        case "error":
            return text.red;
        default:
            console.log("Unknown severity " + severity);
            return text.italic;
    }
};

var severityValues = {
    debug: 1,
    warning: 2,
    error: 3,
    special: 4,
};

var PoolLogger = function (configuration) {
    var logLevelInt = severityValues[configuration.logLevel];
    var logColors = configuration.logColors;

    var log = function (severity, system, component, text, subcat) {
        if (severityValues[severity] < logLevelInt) return;

        if (subcat) {
            var realText = subcat;
            var realSubCat = text;
            text = realText;
            subcat = realSubCat;
        }

        var entryDesc = formatDate(new Date()) + " [" + system + "]\t";
        if (logColors) {
            entryDesc = severityToColor(severity, entryDesc);

            var logString = entryDesc + ("[" + component + "] ").italic;

            if (subcat) logString += ("(" + subcat + ") ").bold.grey;

            logString += text.grey;
        } else {
            var logString = entryDesc + "[" + component + "] ";

            if (subcat) logString += "(" + subcat + ") ";

            logString += text;
        }

        console.log(logString);
    };

    // public

    var _this = this;
    Object.keys(severityValues).forEach(function (logType) {
        _this[logType] = function () {
            var args = Array.prototype.slice.call(arguments, 0);
            args.unshift(logType);
            log.apply(this, args);
        };
    });
};

module.exports = PoolLogger;
