export function getArrivalConfig() {
  const isLocalApiMode = (() => {
    try {
      const params = new URLSearchParams(window.location.search || "");
      return params.get("api") === "local";
    } catch (e) {
      return false;
    }
  })();

  return {
    isLocalApiMode,
    radiusMeters: isLocalApiMode ? 1609 : 100,
    dwellMs: isLocalApiMode ? 10000 : 1000 * 60 * 2,
    snoozeMs: 1000 * 60 * 10,
    promptClearMeters: 250,
  };
}

