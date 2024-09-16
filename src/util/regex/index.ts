const REGEX_COMMA_NOT_IN_DOUBLE_QUOTES =
  /,(?!(?=[^"]*"[^"]*(?:"[^"]*"[^"]*)*$))/gm;
const REGEX_CAPTURE_DV_KEYWORD_NOT_TABLE = /(\n*\s*(?:from|where|sort|limit))(?!(?=[^"]*"[^"]*(?:"[^"]*"[^"]*)*$))/im
const REGEX_CAPTURE_DV_TABLE_KEYWORD = /(^table(?:\s+without\s+id)?\s*)/im


export {
  REGEX_COMMA_NOT_IN_DOUBLE_QUOTES, REGEX_CAPTURE_DV_KEYWORD_NOT_TABLE, REGEX_CAPTURE_DV_TABLE_KEYWORD
}