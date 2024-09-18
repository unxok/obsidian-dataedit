/*
    # PURE FUNCTIONS
    ---
    All functions here should be "pure" functions in that:
    - The same input always corresponds to a consistent output
    - The funciton does "one thing"
    - There are no side effects that occur from running the function

    *typically* pure functions are also unreliant on any other functions,
    but these functions *may* infact use other functions, as long as they
    are also "pure"
*/

import { COMPLEX_PROPERTY_PLACEHOLDER } from "@/lib/constants";
import {
	REGEX_CAPTURE_DV_KEYWORD_NOT_TABLE,
	REGEX_CAPTURE_DV_TABLE_KEYWORD,
	REGEX_COMMA_NOT_IN_DOUBLE_QUOTES,
} from "../regex";
import { DateTime } from "luxon";
import { App, Plugin } from "obsidian";
import { DataviewAPI } from "@/lib/types";

/**
 * Retrives the API from the dataview plugin or null if it can't be found
 */
export const getDataviewAPI = (pApp?: App) => {
	if (pApp) {
		const { plugins } = pApp.plugins;
		if (plugins.hasOwnProperty("dataview")) {
			return (plugins.dataview as Plugin & { api: DataviewAPI }).api;
		}
	}
	const gPlugins = app.plugins.plugins;
	if (gPlugins.hasOwnProperty("dataview")) {
		return (gPlugins.dataview as Plugin & { api: DataviewAPI }).api;
	}
	return null;
};

/**
 * Move an item in an array from one index to another
 * @remark You are responsible for ensuring the indexes are valid
 * @tutorial
 * ```ts
 * const arr = ['a', 'b', 'c', 'd'];
 * const newArr = arrayMove(arr, 1, 3);
 * // ['a', 'c', 'd', 'c']
 * ```
 */
export const arrayMove = (arr: any[], from: number, to: number) => {
	const copy = [...arr];
	const item = copy[from];
	copy.splice(from, 1);
	copy.splice(to, 0, item);
	return copy;
};

/**
 * Get the section of a Dataview query that contains the TABLE data command
 * @remark Not case sensitive and will retain newline characters in `rest`
 * @tutorial
 * ```ts
 * getTableLine('TABLE col1, col2 as "alias" FROM #tag...')
 * // {tableLine: "TABLE col1, col2 as "alias", rest: "FROM #tag..."}
 * ```
 */
export const getTableLine = (query: string) => {
	const reg = REGEX_CAPTURE_DV_KEYWORD_NOT_TABLE;
	const [line, ...rest] = query.split(reg);

	return {
		tableLine: line,
		rest: rest.join(""),
	};
};

/**
 * Get the "TABLE" or "TABLE WITHOUT ID" out of a Dataview TABLE data command
 * @remark Not case sensitive and will capture trailing spaces
 * @tutorial
 * ```ts
 * splitTableKeyword("TaBLe wITHouT  iD col1, col2...")
 * // {keyword: "TaBLe wITHouT  ", rest: iD col1, col2...}
 * ```
 */
export const splitTableKeyword = (tableLine: string) => {
	const [_, keyword, ...rest] = tableLine.split(REGEX_CAPTURE_DV_TABLE_KEYWORD);
	return {
		keyword: keyword,
		rest: rest.join(""),
	};
};

/**
 * Returns the provided string with the first character in upper case
 * @remark The entire string is treated as one word with no regard for spaces or any other delimeter
 * @tutorial
 * ```ts
 * toFirstUpperCase("word")
 * // "Word"
 * toFirstUpperCase("weIRd wOrDS-with,weird-format")
 * // "WeIRd wOrDS-with,weird-format"
 * ```
 */
export const toFirstUpperCase = (str: string) => {
	const first = str.charAt(0).toUpperCase();
	return first + str.slice(1);
};

/**
 * Extracts property names from a Dataview query
 * @remark properties that use functions or operators are "complex" and will be replaced with the COMPLEX_PROPERTY_PLACEHOLDER constant (which is an invalid property name)
 * @remark This could probably use some work... it doesn't feel like a foolproof way to check for complexity
 * @remark TODO Ideally should also for Dataview row syntax: `row["<property name with spaces>""]`
 */
export const getColumnPropertyNames = (source: string) => {
	// const line = source.split("\n")[0];
	const line = getTableLine(source).tableLine;
	// TODO possible could have this string within a column alias
	const isWithoutId = line.toLowerCase().includes("without id");
	const cols = source
		.split("\n")[0]
		.substring(isWithoutId ? 17 : 6)
		.split(REGEX_COMMA_NOT_IN_DOUBLE_QUOTES)
		.map((c) => {
			const str = c.trim();
			const potential = str.split(/\sAS\s/i)[0].trim();
			// console.log("potential: ", potential);
			const invalidChars = [
				"(",
				")",
				"[",
				"]",
				"{",
				"}",
				"+",
				// "-", dashes are pretty common in property names
				"*",
				"/",
				"%",
				"<",
				">",
				"!",
				"=",
				'"',
			];
			const isComplex =
				!Number.isNaN(Number(potential)) ||
				//prettier-ignore
				potential
        .split("")
        .some((char) => invalidChars.includes(char));
			if (isComplex) {
				// property is manipulated in the query
				// so it can't be edited since it's a calculated value
				return COMPLEX_PROPERTY_PLACEHOLDER;
			}
			return potential;
		});
	if (isWithoutId) return cols;
	// so it matches with what is returned from dataview
	return ["File", ...cols];
};

/**
 * Check if `n` is within the min-max range, if not returns applicable bound
 */
export const clampNumber = (
	n: number,
	min: number,
	max: number,
	inclusive?: boolean
) => {
	if (inclusive ? n <= min : n < min) return min;
	if (inclusive ? n >= max : n > max) return max;
	return n;
};

/**
 * `Number()` that doesn't return `NaN` unless specified, and provides more options for parsing
 */
export const toNumber = (
	v: unknown,
	defaultNumber?: number,
	min?: number,
	max?: number,
	validator?: (val: unknown, num: number) => boolean
) => {
	const num = Number(v);
	if (Number.isNaN(num)) return defaultNumber ?? 0;
	if (validator) {
		if (!validator(v, num)) return defaultNumber ?? 0;
	}
	if (min !== undefined) {
		if (num < min) return min;
	}
	if (max !== undefined) {
		if (num > max) return max;
	}
	return num;
};

/**
 * Checks if a luxon DateTime has a non-zero time value
 * @param dt luxon DateTime
 * @returns `true` if time is not all zeroes, false otherwise
 */
export const checkIfDateHasTime = (dt: DateTime) => {
	const isTime = dt.hour !== 0 || dt.minute !== 0 || dt.second !== 0;
	return isTime;
};
