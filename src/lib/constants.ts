/**
 * Placeholder for complex properties from a Dataview query
 * ```
 * TABLE Date(complex1), sum(complex2) - 3
 * FROM #someTag
 * WHERE true
 * ```
 * ---
 * `"file.complex-property"`
 *
 * this would be invalid to use as a property name in
 * Dataview, so this is safe to use as an identifier
 * between functions
 */
export const COMPLEX_PROPERTY_PLACEHOLDER = "file.complex-property";