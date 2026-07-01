const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("cloakClient", {
  apiBase: process.env.CLOAK_API_BASE || "",
  mode: "desktop",
  platform: process.platform,
});
