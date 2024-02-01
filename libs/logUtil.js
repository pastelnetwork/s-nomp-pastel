const colors = require("colors");

// Define severity to color mapping and severity values
const severityToColor = function (severity, text) {
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

const severityValues = {
    debug: 1,
    warning: 2,
    error: 3,
    special: 4,
};

// Asynchronously initializes the PoolLogger with dynamic import for dateFormat
async function initializeLogger(configuration) {
    const dateFormat = (await import("dateformat")).default;
    return new PoolLogger(configuration, dateFormat);
}

class PoolLogger {
    constructor(configuration, dateFormat) {
        this.configuration = configuration;
        this.dateFormat = dateFormat;
        this.logLevelInt = severityValues[configuration.logLevel];
        this.logColors = configuration.logColors;

        // Dynamically create logging methods for each severity level
        Object.keys(severityValues).forEach((logType) => {
            this[logType] = (...args) => {
                args.unshift(logType);
                this.log.apply(this, args);
            };
        });
    }

    log(severity, system, component, text, subcat) {
        if (severityValues[severity] < this.logLevelInt) return;

        if (subcat) {
            let realText = subcat;
            let realSubCat = text;
            text = realText;
            subcat = realSubCat;
        }

        let entryDesc =
            this.dateFormat(new Date(), "yyyy-mm-dd HH:MM:ss") +
            " [" +
            system +
            "]\t";
        let logString; // Define logString outside the if-else scope
        if (this.logColors) {
            entryDesc = severityToColor(severity, entryDesc);

            logString = entryDesc + ("[" + component + "] ").italic;
            if (subcat) logString += ("(" + subcat + ") ").bold.grey;
            logString += text.grey;
        } else {
            logString = entryDesc + "[" + component + "] ";
            if (subcat) logString += "(" + subcat + ") ";
            logString += text;
        }

        console.log(logString); // Now logString is accessible here
    }
}

module.exports = initializeLogger;
