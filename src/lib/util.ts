import { DataviewLink, DataviewPropertyValueNotLink } from "./types";

export const checkIfDataviewLink = (val: unknown) => {
  if (!val) return false;
  if (typeof val !== "object") return false;
  if (!val.hasOwnProperty("type")) return false;
  if ((val as { type: unknown }).type !== "file") return false;
  return true;
};

export const tryDataviewLinkToMarkdown = (val: unknown) => {
  if (!checkIfDataviewLink(val)) return val as DataviewPropertyValueNotLink;
  return (val as DataviewLink).markdown();
};
