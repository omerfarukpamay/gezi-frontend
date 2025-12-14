export function parseSuggestionLine(line) {
  const text = String(line || "").trim();
  const timeMatch = text.match(/(\d{1,2}:\d{2})/);
  const time = timeMatch ? timeMatch[1] : "--:--";
  const title = text
    .replace(/^\s*\d{1,2}:\d{2}\s*-\s*/, "")
    .replace(/^[\-\d\.\)\s]+/, "")
    .trim() || text;

  return { time, title };
}

