// Scram Desktop 0.3.x put the connector in resources/claude-connector, and wrote that path into
// the Claude app's settings. It now lives in resources/connector: this forwards to it, so those
// connections keep working until "Connect the Claude desktop app" is clicked again.
import "../connector/index.mjs";
