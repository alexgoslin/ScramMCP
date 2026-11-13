// Where Scram lives. The dashboard (project list) and the editor (a project, with the AI chat)
// are on different hosts.
//
// SCRAM_MCP_DEV_HOME points the app at another site instead (the fake Scram page the tests use).
// Then every page on that origin counts as Scram, and pages whose path contains "/editor" count
// as the editor. Leave it unset for the real thing.

export function scramUrls(devHome = process.env.SCRAM_MCP_DEV_HOME) {
  if (devHome) {
    const origin = new URL(devHome).origin;
    return {
      home: devHome,
      isScram: (url) => String(url || "").startsWith(origin),
      isEditor: (url) => String(url || "").startsWith(origin) && /\/editor/.test(new URL(url).pathname),
    };
  }
  return {
    home: "https://dashboard.buildwithscram.com/",
    isScram: (url) => /^https:\/\/([a-z0-9-]+\.)*buildwithscram\.com(\/|$)/i.test(url || ""),
    isEditor: (url) => /^https:\/\/editor\.buildwithscram\.com\//i.test(url || ""),
  };
}
