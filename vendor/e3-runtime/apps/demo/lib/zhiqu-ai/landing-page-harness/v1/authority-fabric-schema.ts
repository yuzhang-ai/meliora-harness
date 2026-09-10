import type {
  DeterministicJsonSchemaV1,
  JsonPrimitiveV1,
} from "./authority-fabric-contracts";
import {
  FORMAL_R3_AUTHORITY_FABRIC_V1,
} from "./authority-fabric-contracts";
import {
  StrictJsonErrorV1,
  assertStrictJsonV1,
  canonicalJsonV1,
  hashCanonicalJsonV1,
} from "./strict-json";

export const DETERMINISTIC_SCHEMA_LIMITS_V1 = Object.freeze({
  maxDepth: 12,
  maxNodes: 256,
  maxPropertiesPerNode: 64,
  maxDefs: 32,
  maxOneOfBranches: 8,
  maxEnumValues: 64,
  maxPatternBytes: 160,
  maxCanonicalBytes: 65_536,
} as const);

const KEYWORDS = Object.freeze([
  "$defs",
  "$ref",
  "additionalProperties",
  "const",
  "enum",
  "items",
  "maxItems",
  "maxLength",
  "maximum",
  "minItems",
  "minLength",
  "minimum",
  "oneOf",
  "pattern",
  "properties",
  "required",
  "type",
  "uniqueItems",
] as const);

export const DETERMINISTIC_SCHEMA_NORMALIZER_HASH_V1 = hashCanonicalJsonV1({
  version: FORMAL_R3_AUTHORITY_FABRIC_V1.schemaNormalizerVersion,
  limits: DETERMINISTIC_SCHEMA_LIMITS_V1,
  keywords: KEYWORDS,
  localRefGrammar: "#/$defs/<identity>",
  objectAdditionalProperties: "must_be_false",
  collectionOrder: "code_unit",
  composition: "bounded_one_of_no_nesting",
  patternPolicy:
    "anchored_literals_or_character_classes_with_closed_bounded_quantifiers_only_v2",
});

const compareCodeUnit = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

const assertAllowedKeys = (
  record: Record<string, unknown>,
  allowed: readonly string[],
  path: string
) => {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      throw new StrictJsonErrorV1(
        "schema_keyword_forbidden",
        `${path}.${key}`,
        "Keyword is outside the deterministic schema subset."
      );
    }
  }
};

const boundedInteger = (
  value: unknown,
  path: string,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER
) => {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    throw new StrictJsonErrorV1(
      "schema_integer_invalid",
      path,
      `Expected an integer in ${minimum}..${maximum}.`
    );
  }
  return value as number;
};

const finiteNumber = (value: unknown, path: string) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new StrictJsonErrorV1(
      "schema_number_invalid",
      path,
      "Expected a finite number."
    );
  }
  return value;
};

const primitive = (value: unknown, path: string): JsonPrimitiveV1 => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  throw new StrictJsonErrorV1(
    "schema_primitive_invalid",
    path,
    "Expected a finite JSON primitive."
  );
};

const schemaIdentity = (value: string, path: string) => {
  if (!/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u.test(value)) {
    throw new StrictJsonErrorV1(
      "schema_identity_invalid",
      path,
      "Schema identity is invalid."
    );
  }
  return value;
};

const boundedPattern = (value: unknown, path: string) => {
  if (typeof value !== "string") {
    throw new StrictJsonErrorV1(
      "schema_pattern_invalid",
      path,
      "Pattern must be a string."
    );
  }
  const bytes = new TextEncoder().encode(value).byteLength;
  if (
    bytes === 0 ||
    bytes > DETERMINISTIC_SCHEMA_LIMITS_V1.maxPatternBytes ||
    !value.startsWith("^") ||
    !value.endsWith("$") ||
    /[()*+?|]/u.test(value) ||
    /\\[1-9]/u.test(value)
  ) {
    throw new StrictJsonErrorV1(
      "schema_pattern_unsafe",
      path,
      "Pattern exceeds the bounded deterministic policy."
    );
  }
  let inClass = false;
  for (let index = 1; index < value.length - 1; index += 1) {
    const character = value[index]!;
    if (character === "\\") {
      index += 1;
      if (index >= value.length - 1) {
        throw new StrictJsonErrorV1(
          "schema_pattern_unsafe",
          path,
          "Pattern escape is incomplete."
        );
      }
      continue;
    }
    if (character === "[") {
      if (inClass) {
        throw new StrictJsonErrorV1(
          "schema_pattern_unsafe",
          path,
          "Nested character classes are not supported."
        );
      }
      inClass = true;
      continue;
    }
    if (character === "]") {
      if (!inClass) {
        throw new StrictJsonErrorV1(
          "schema_pattern_unsafe",
          path,
          "Character class terminator is unmatched."
        );
      }
      inClass = false;
      continue;
    }
    if (!inClass && character === ".") {
      throw new StrictJsonErrorV1(
        "schema_pattern_unsafe",
        path,
        "Wildcard patterns are outside the deterministic subset."
      );
    }
    if (!inClass && character === "{") {
      const remainder = value.slice(index);
      const match = /^\{(\d+)(?:,(\d+))?\}/u.exec(remainder);
      if (!match) {
        throw new StrictJsonErrorV1(
          "schema_pattern_unsafe",
          path,
          "Only closed bounded quantifiers are supported."
        );
      }
      const minimum = Number(match[1]);
      const maximum = Number(match[2] ?? match[1]);
      if (
        !Number.isSafeInteger(minimum) ||
        !Number.isSafeInteger(maximum) ||
        minimum > maximum ||
        maximum > 10_000
      ) {
        throw new StrictJsonErrorV1(
          "schema_pattern_unsafe",
          path,
          "Pattern quantifier exceeds the deterministic bound."
        );
      }
      index += match[0].length - 1;
    }
  }
  if (inClass) {
    throw new StrictJsonErrorV1(
      "schema_pattern_unsafe",
      path,
      "Character class is not closed."
    );
  }
  try {
    void new RegExp(value, "u");
  } catch {
    throw new StrictJsonErrorV1(
      "schema_pattern_invalid",
      path,
      "Pattern is not valid Unicode RegExp syntax."
    );
  }
  return value;
};

type DecodeState = {
  nodes: number;
  refs: Set<string>;
  defs: Set<string>;
};

const primitiveMatchesType = (
  value: JsonPrimitiveV1,
  type: NonNullable<DeterministicJsonSchemaV1["type"]>
) => {
  if (type === "null") return value === null;
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (type === "number") return typeof value === "number";
  return typeof value === type;
};

const collectLocalRefs = (
  schema: DeterministicJsonSchemaV1,
  refs: Set<string>
) => {
  if (schema.$ref) refs.add(schema.$ref.slice("#/$defs/".length));
  for (const branch of schema.oneOf ?? []) collectLocalRefs(branch, refs);
  for (const property of Object.values(schema.properties ?? {})) {
    collectLocalRefs(property, refs);
  }
  if (schema.items) collectLocalRefs(schema.items, refs);
};

const assertAcyclicLocalDefinitions = (
  schema: DeterministicJsonSchemaV1,
  path: string
) => {
  const definitions = schema.$defs ?? {};
  const edges = new Map<string, Set<string>>();
  for (const [definitionId, definition] of Object.entries(definitions)) {
    const refs = new Set<string>();
    collectLocalRefs(definition, refs);
    edges.set(definitionId, refs);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (definitionId: string) => {
    if (visiting.has(definitionId)) {
      throw new StrictJsonErrorV1(
        "schema_ref_cycle",
        `${path}.$defs.${definitionId}`,
        "Recursive local schema references are forbidden."
      );
    }
    if (visited.has(definitionId)) return;
    visiting.add(definitionId);
    for (const target of edges.get(definitionId) ?? []) visit(target);
    visiting.delete(definitionId);
    visited.add(definitionId);
  };
  for (const definitionId of edges.keys()) visit(definitionId);
};

const decodeNode = (
  value: unknown,
  path: string,
  depth: number,
  compositionDepth: number,
  state: DecodeState
): DeterministicJsonSchemaV1 => {
  assertStrictJsonV1(value, path);
  if (!isPlainObject(value)) {
    throw new StrictJsonErrorV1(
      "schema_object_expected",
      path,
      "Schema node must be a plain object."
    );
  }
  state.nodes += 1;
  if (
    depth > DETERMINISTIC_SCHEMA_LIMITS_V1.maxDepth ||
    state.nodes > DETERMINISTIC_SCHEMA_LIMITS_V1.maxNodes
  ) {
    throw new StrictJsonErrorV1(
      "schema_budget_exceeded",
      path,
      "Schema depth or node budget was exceeded."
    );
  }
  assertAllowedKeys(value, KEYWORDS, path);

  const defs = value.$defs;
  let normalizedDefs: Readonly<Record<string, DeterministicJsonSchemaV1>> | undefined;
  if (defs !== undefined) {
    if (depth !== 0) {
      throw new StrictJsonErrorV1(
        "schema_nested_defs_forbidden",
        `${path}.$defs`,
        "$defs may only appear on the root schema node."
      );
    }
    if (!isPlainObject(defs)) {
      throw new StrictJsonErrorV1(
        "schema_defs_invalid",
        `${path}.$defs`,
        "$defs must be a plain object."
      );
    }
    const entries = Object.entries(defs).sort(([left], [right]) =>
      compareCodeUnit(left, right)
    );
    if (entries.length > DETERMINISTIC_SCHEMA_LIMITS_V1.maxDefs) {
      throw new StrictJsonErrorV1(
        "schema_defs_budget_exceeded",
        `${path}.$defs`,
        "Too many local definitions."
      );
    }
    for (const [key] of entries) {
      schemaIdentity(key, `${path}.$defs.${key}`);
      state.defs.add(key);
    }
    normalizedDefs = Object.fromEntries(
      entries.map(([key, entry]) => {
        return [
          key,
          decodeNode(entry, `${path}.$defs.${key}`, depth + 1, compositionDepth, state),
        ];
      })
    );
  }

  if (value.$ref !== undefined) {
    const ref = value.$ref;
    if (typeof ref !== "string" || !/^#\/\$defs\/[A-Za-z][A-Za-z0-9._:-]{0,127}$/u.test(ref)) {
      throw new StrictJsonErrorV1(
        "schema_ref_forbidden",
        `${path}.$ref`,
        "Only bounded local $defs references are allowed."
      );
    }
    const keys = Object.keys(value).filter((key) => key !== "$defs");
    if (keys.length !== 1 || keys[0] !== "$ref") {
      throw new StrictJsonErrorV1(
        "schema_ref_siblings_forbidden",
        path,
        "$ref cannot have interpretation-changing siblings."
      );
    }
    state.refs.add(ref.slice("#/$defs/".length));
    return normalizedDefs ? { $ref: ref, $defs: normalizedDefs } : { $ref: ref };
  }

  if (value.oneOf !== undefined) {
    if (compositionDepth > 0 || !Array.isArray(value.oneOf)) {
      throw new StrictJsonErrorV1(
        "schema_composition_forbidden",
        `${path}.oneOf`,
        "Only one bounded, non-nested oneOf is allowed."
      );
    }
    if (
      value.oneOf.length < 2 ||
      value.oneOf.length > DETERMINISTIC_SCHEMA_LIMITS_V1.maxOneOfBranches
    ) {
      throw new StrictJsonErrorV1(
        "schema_composition_budget_exceeded",
        `${path}.oneOf`,
        "oneOf branch count is outside the deterministic budget."
      );
    }
    const keys = Object.keys(value).filter((key) => key !== "$defs");
    if (keys.length !== 1 || keys[0] !== "oneOf") {
      throw new StrictJsonErrorV1(
        "schema_composition_siblings_forbidden",
        path,
        "oneOf cannot have interpretation-changing siblings."
      );
    }
    const branches = value.oneOf
      .map((entry, index) =>
        decodeNode(entry, `${path}.oneOf[${index}]`, depth + 1, compositionDepth + 1, state)
      )
      .sort((left, right) => compareCodeUnit(canonicalJsonV1(left), canonicalJsonV1(right)));
    const serialized = branches.map(canonicalJsonV1);
    if (new Set(serialized).size !== serialized.length) {
      throw new StrictJsonErrorV1(
        "schema_duplicate_branch",
        `${path}.oneOf`,
        "oneOf branches must be unique."
      );
    }
    return normalizedDefs ? { oneOf: branches, $defs: normalizedDefs } : { oneOf: branches };
  }

  const type = value.type;
  if (
    type !== "object" &&
    type !== "array" &&
    type !== "string" &&
    type !== "number" &&
    type !== "integer" &&
    type !== "boolean" &&
    type !== "null"
  ) {
    throw new StrictJsonErrorV1(
      "schema_type_invalid",
      `${path}.type`,
      "A supported explicit type is required."
    );
  }

  const output: Record<string, unknown> = { type };
  if (normalizedDefs) output.$defs = normalizedDefs;

  if (value.const !== undefined) {
    const normalizedConst = primitive(value.const, `${path}.const`);
    if (!primitiveMatchesType(normalizedConst, type)) {
      throw new StrictJsonErrorV1(
        "schema_const_type_mismatch",
        `${path}.const`,
        "const must match the declared schema type."
      );
    }
    output.const = normalizedConst;
  }
  if (value.enum !== undefined) {
    if (
      !Array.isArray(value.enum) ||
      value.enum.length === 0 ||
      value.enum.length > DETERMINISTIC_SCHEMA_LIMITS_V1.maxEnumValues
    ) {
      throw new StrictJsonErrorV1(
        "schema_enum_invalid",
        `${path}.enum`,
        "Enum is empty or exceeds its budget."
      );
    }
    const values = value.enum
      .map((entry, index) => primitive(entry, `${path}.enum[${index}]`))
      .sort((left, right) => compareCodeUnit(canonicalJsonV1(left), canonicalJsonV1(right)));
    if (values.some((entry) => !primitiveMatchesType(entry, type))) {
      throw new StrictJsonErrorV1(
        "schema_enum_type_mismatch",
        `${path}.enum`,
        "Every enum value must match the declared schema type."
      );
    }
    if (new Set(values.map(canonicalJsonV1)).size !== values.length) {
      throw new StrictJsonErrorV1(
        "schema_enum_duplicate",
        `${path}.enum`,
        "Enum values must be unique."
      );
    }
    output.enum = values;
  }

  if (type === "object") {
    if (value.additionalProperties !== false) {
      throw new StrictJsonErrorV1(
        "schema_object_not_closed",
        `${path}.additionalProperties`,
        "Object schemas must set additionalProperties to false."
      );
    }
    output.additionalProperties = false;
    if (!isPlainObject(value.properties)) {
      throw new StrictJsonErrorV1(
        "schema_properties_invalid",
        `${path}.properties`,
        "Object schemas require a properties object."
      );
    }
    const properties = Object.entries(value.properties).sort(([left], [right]) =>
      compareCodeUnit(left, right)
    );
    if (properties.length > DETERMINISTIC_SCHEMA_LIMITS_V1.maxPropertiesPerNode) {
      throw new StrictJsonErrorV1(
        "schema_properties_budget_exceeded",
        `${path}.properties`,
        "Too many object properties."
      );
    }
    output.properties = Object.fromEntries(
      properties.map(([key, entry]) => {
        schemaIdentity(key, `${path}.properties.${key}`);
        return [key, decodeNode(entry, `${path}.properties.${key}`, depth + 1, compositionDepth, state)];
      })
    );
    const required = value.required ?? [];
    if (!Array.isArray(required) || required.some((entry) => typeof entry !== "string")) {
      throw new StrictJsonErrorV1(
        "schema_required_invalid",
        `${path}.required`,
        "required must be a string array."
      );
    }
    const normalizedRequired = [...required].sort(compareCodeUnit) as string[];
    if (
      new Set(normalizedRequired).size !== normalizedRequired.length ||
      normalizedRequired.some((key) => !Object.hasOwn(output.properties as object, key))
    ) {
      throw new StrictJsonErrorV1(
        "schema_required_unknown_or_duplicate",
        `${path}.required`,
        "Required properties must be unique and declared."
      );
    }
    output.required = normalizedRequired;
  } else if (
    value.properties !== undefined ||
    value.required !== undefined ||
    value.additionalProperties !== undefined
  ) {
    throw new StrictJsonErrorV1(
      "schema_object_keyword_mismatch",
      path,
      "Object keywords require type object."
    );
  }

  if (type === "array") {
    if (value.items === undefined) {
      throw new StrictJsonErrorV1(
        "schema_items_missing",
        `${path}.items`,
        "Array schemas require bounded items."
      );
    }
    output.items = decodeNode(value.items, `${path}.items`, depth + 1, compositionDepth, state);
    output.minItems = boundedInteger(value.minItems ?? 0, `${path}.minItems`, 0, 10_000);
    output.maxItems = boundedInteger(value.maxItems, `${path}.maxItems`, 0, 10_000);
    if ((output.maxItems as number) < (output.minItems as number)) {
      throw new StrictJsonErrorV1(
        "schema_range_invalid",
        path,
        "maxItems must be greater than or equal to minItems."
      );
    }
    if (value.uniqueItems !== undefined) {
      if (typeof value.uniqueItems !== "boolean") {
        throw new StrictJsonErrorV1(
          "schema_unique_items_invalid",
          `${path}.uniqueItems`,
          "uniqueItems must be boolean."
        );
      }
      output.uniqueItems = value.uniqueItems;
    }
  } else if (
    value.items !== undefined ||
    value.minItems !== undefined ||
    value.maxItems !== undefined ||
    value.uniqueItems !== undefined
  ) {
    throw new StrictJsonErrorV1(
      "schema_array_keyword_mismatch",
      path,
      "Array keywords require type array."
    );
  }

  if (type === "string") {
    if (value.minLength !== undefined) {
      output.minLength = boundedInteger(value.minLength, `${path}.minLength`, 0, 1_000_000);
    }
    if (value.maxLength !== undefined) {
      output.maxLength = boundedInteger(value.maxLength, `${path}.maxLength`, 0, 1_000_000);
    }
    if (
      output.minLength !== undefined &&
      output.maxLength !== undefined &&
      (output.maxLength as number) < (output.minLength as number)
    ) {
      throw new StrictJsonErrorV1("schema_range_invalid", path, "maxLength is smaller than minLength.");
    }
    if (value.pattern !== undefined) output.pattern = boundedPattern(value.pattern, `${path}.pattern`);
  } else if (
    value.minLength !== undefined ||
    value.maxLength !== undefined ||
    value.pattern !== undefined
  ) {
    throw new StrictJsonErrorV1(
      "schema_string_keyword_mismatch",
      path,
      "String keywords require type string."
    );
  }

  if (type === "number" || type === "integer") {
    if (value.minimum !== undefined) output.minimum = finiteNumber(value.minimum, `${path}.minimum`);
    if (value.maximum !== undefined) output.maximum = finiteNumber(value.maximum, `${path}.maximum`);
    if (
      output.minimum !== undefined &&
      output.maximum !== undefined &&
      (output.maximum as number) < (output.minimum as number)
    ) {
      throw new StrictJsonErrorV1("schema_range_invalid", path, "maximum is smaller than minimum.");
    }
  } else if (value.minimum !== undefined || value.maximum !== undefined) {
    throw new StrictJsonErrorV1(
      "schema_number_keyword_mismatch",
      path,
      "Numeric keywords require type number or integer."
    );
  }

  return output as DeterministicJsonSchemaV1;
};

export const decodeDeterministicJsonSchemaV1 = (
  value: unknown,
  path = "schema"
): DeterministicJsonSchemaV1 => {
  const state: DecodeState = { nodes: 0, refs: new Set(), defs: new Set() };
  const normalized = decodeNode(value, path, 0, 0, state);
  for (const ref of state.refs) {
    if (!state.defs.has(ref)) {
      throw new StrictJsonErrorV1(
        "schema_ref_unresolved",
        path,
        `Local definition ${ref} is not present.`
      );
    }
  }
  assertAcyclicLocalDefinitions(normalized, path);
  if (
    new TextEncoder().encode(canonicalJsonV1(normalized)).byteLength >
    DETERMINISTIC_SCHEMA_LIMITS_V1.maxCanonicalBytes
  ) {
    throw new StrictJsonErrorV1(
      "schema_canonical_budget_exceeded",
      path,
      "Canonical schema exceeds its byte budget."
    );
  }
  return normalized;
};

export const hashDeterministicJsonSchemaV1 = (value: unknown) =>
  hashCanonicalJsonV1(decodeDeterministicJsonSchemaV1(value));

export const DETERMINISTIC_SCHEMA_INSTANCE_VALIDATOR_HASH_V1 =
  hashCanonicalJsonV1({
    version: "formal-r3-deterministic-schema-instance-validator-v1",
    normalizerHash: DETERMINISTIC_SCHEMA_NORMALIZER_HASH_V1,
    objectPolicy: "closed_required_exact_recursive_v1",
    arrayPolicy: "bounded_unique_canonical_v1",
    scalarPolicy: "finite_const_enum_range_pattern_v1",
    localRefPolicy: "root_defs_only_acyclic_v1",
    oneOfPolicy: "exactly_one_branch_v1",
  });

const instanceError = (code: string, path: string, message: string): never => {
  throw new StrictJsonErrorV1(code, path, message);
};

const validateInstanceNodeV1 = (
  schema: DeterministicJsonSchemaV1,
  value: unknown,
  path: string,
  rootDefinitions: Readonly<Record<string, DeterministicJsonSchemaV1>>,
  depth: number
): unknown => {
  if (depth > DETERMINISTIC_SCHEMA_LIMITS_V1.maxDepth) {
    return instanceError(
      "schema_instance_depth_exceeded",
      path,
      "JSON value exceeds the deterministic schema depth budget."
    );
  }
  if (schema.$ref) {
    const definitionId = schema.$ref.slice("#/$defs/".length);
    const target = rootDefinitions[definitionId];
    if (!target) {
      return instanceError(
        "schema_instance_ref_unresolved",
        path,
        "JSON value references an unavailable local schema definition."
      );
    }
    return validateInstanceNodeV1(
      target,
      value,
      path,
      rootDefinitions,
      depth + 1
    );
  }
  if (schema.oneOf) {
    const matches: unknown[] = [];
    const failures: StrictJsonErrorV1[] = [];
    for (const branch of schema.oneOf) {
      try {
        matches.push(
          validateInstanceNodeV1(
            branch,
            value,
            path,
            rootDefinitions,
            depth + 1
          )
        );
      } catch (error) {
        if (!(error instanceof StrictJsonErrorV1)) throw error;
        failures.push(error);
      }
    }
    if (matches.length !== 1) {
      const firstFailure = failures[0];
      if (
        matches.length === 0 &&
        firstFailure &&
        failures.every(
          (failure) =>
            failure.code === firstFailure.code &&
            failure.path === firstFailure.path
        )
      ) {
        throw firstFailure;
      }
      return instanceError(
        "schema_instance_one_of_mismatch",
        path,
        "JSON value must match exactly one deterministic oneOf branch."
      );
    }
    return matches[0];
  }

  const type = schema.type;
  const typeMatches =
    type === "null"
      ? value === null
      : type === "array"
        ? Array.isArray(value)
        : type === "object"
          ? isPlainObject(value)
          : type === "integer"
            ? typeof value === "number" && Number.isSafeInteger(value)
            : type === "number"
              ? typeof value === "number" && Number.isFinite(value)
              : typeof value === type;
  if (!typeMatches) {
    return instanceError(
      "schema_instance_type_mismatch",
      path,
      `JSON value does not match schema type ${String(type)}.`
    );
  }

  if (
    schema.const !== undefined &&
    canonicalJsonV1(value) !== canonicalJsonV1(schema.const)
  ) {
    return instanceError(
      "schema_instance_const_mismatch",
      path,
      "JSON value differs from the schema const."
    );
  }
  if (
    schema.enum &&
    !schema.enum.some(
      (entry) => canonicalJsonV1(entry) === canonicalJsonV1(value)
    )
  ) {
    return instanceError(
      "schema_instance_enum_mismatch",
      path,
      "JSON value is outside the schema enum."
    );
  }

  if (type === "object") {
    const record = value as Record<string, unknown>;
    const properties = schema.properties ?? {};
    const actualKeys = Object.keys(record);
    const unknownKey = actualKeys.find((key) => !Object.hasOwn(properties, key));
    if (unknownKey) {
      return instanceError(
        "schema_instance_unknown_property",
        `${path}.${unknownKey}`,
        "JSON object contains a property outside the closed schema."
      );
    }
    const missingKey = (schema.required ?? []).find(
      (key) => !Object.hasOwn(record, key)
    );
    if (missingKey) {
      return instanceError(
        "schema_instance_required_property_missing",
        `${path}.${missingKey}`,
        "JSON object is missing a required property."
      );
    }
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(properties).sort(compareCodeUnit)) {
      if (Object.hasOwn(record, key)) {
        output[key] = validateInstanceNodeV1(
          properties[key]!,
          record[key],
          `${path}.${key}`,
          rootDefinitions,
          depth + 1
        );
      }
    }
    return output;
  }

  if (type === "array") {
    const values = value as unknown[];
    if (
      values.length < (schema.minItems ?? 0) ||
      values.length > (schema.maxItems ?? 0)
    ) {
      return instanceError(
        "schema_instance_array_budget_mismatch",
        path,
        "JSON array length is outside the schema bounds."
      );
    }
    const output = values.map((entry, index) =>
      validateInstanceNodeV1(
        schema.items!,
        entry,
        `${path}[${index}]`,
        rootDefinitions,
        depth + 1
      )
    );
    if (
      schema.uniqueItems &&
      new Set(output.map((entry) => canonicalJsonV1(entry))).size !==
        output.length
    ) {
      return instanceError(
        "schema_instance_array_duplicate",
        path,
        "JSON array violates uniqueItems."
      );
    }
    return output;
  }

  if (type === "string") {
    const text = value as string;
    const length = [...text].length;
    if (
      length < (schema.minLength ?? 0) ||
      (schema.maxLength !== undefined && length > schema.maxLength)
    ) {
      return instanceError(
        "schema_instance_string_budget_mismatch",
        path,
        "JSON string length is outside the schema bounds."
      );
    }
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(text)) {
      return instanceError(
        "schema_instance_pattern_mismatch",
        path,
        "JSON string does not match the bounded schema pattern."
      );
    }
  }

  if (type === "number" || type === "integer") {
    const number = value as number;
    if (
      (schema.minimum !== undefined && number < schema.minimum) ||
      (schema.maximum !== undefined && number > schema.maximum)
    ) {
      return instanceError(
        "schema_instance_number_range_mismatch",
        path,
        "JSON number is outside the schema range."
      );
    }
  }
  return value;
};

export const decodeDeterministicJsonValueV1 = (
  schemaInput: unknown,
  value: unknown,
  path = "value"
): unknown => {
  assertStrictJsonV1(value, path);
  const schema = decodeDeterministicJsonSchemaV1(schemaInput);
  const rootDefinitions = schema.$defs ?? {};
  const decoded = validateInstanceNodeV1(
    schema,
    value,
    path,
    rootDefinitions,
    0
  );
  if (
    new TextEncoder().encode(canonicalJsonV1(decoded)).byteLength >
    DETERMINISTIC_SCHEMA_LIMITS_V1.maxCanonicalBytes
  ) {
    return instanceError(
      "schema_instance_canonical_budget_exceeded",
      path,
      "Canonical JSON value exceeds the deterministic schema byte budget."
    );
  }
  return decoded;
};
