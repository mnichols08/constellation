// Generated from rust/constellation-spec/src/schema.rs by `npm run build:schema`; do not edit.
export const specSchema = {
  "$defs": {
    "filter": {
      "additionalProperties": false,
      "description": "Repository filter. One key per object is canonical; several keys mean all must hold. Nesting depth and total conditions are bounded.",
      "minProperties": 1,
      "properties": {
        "all": {
          "items": {
            "$ref": "#/$defs/filter"
          },
          "maxItems": 64,
          "minItems": 1,
          "type": "array"
        },
        "any": {
          "items": {
            "$ref": "#/$defs/filter"
          },
          "maxItems": 64,
          "minItems": 1,
          "type": "array"
        },
        "archived": {
          "type": "boolean"
        },
        "fork": {
          "type": "boolean"
        },
        "language": {
          "maxLength": 120,
          "minLength": 1,
          "type": "string"
        },
        "not": {
          "$ref": "#/$defs/filter"
        },
        "repository": {
          "description": "A repository id returned by a discovery tool.",
          "maxLength": 200,
          "minLength": 1,
          "type": "string"
        },
        "role": {
          "enum": [
            "featured",
            "supporting",
            "experimental",
            "historical",
            "unassigned"
          ]
        },
        "stars": {
          "additionalProperties": false,
          "minProperties": 1,
          "properties": {
            "max": {
              "maximum": 100000000,
              "minimum": 0,
              "type": "integer"
            },
            "min": {
              "maximum": 100000000,
              "minimum": 0,
              "type": "integer"
            }
          },
          "type": "object"
        },
        "topic": {
          "maxLength": 120,
          "minLength": 1,
          "type": "string"
        },
        "updated": {
          "additionalProperties": false,
          "description": "Days between the repository's last update and the evidence reference date.",
          "minProperties": 1,
          "properties": {
            "older_than_days": {
              "maximum": 36500,
              "minimum": 0,
              "type": "integer"
            },
            "within_days": {
              "maximum": 36500,
              "minimum": 0,
              "type": "integer"
            }
          },
          "type": "object"
        }
      },
      "type": "object"
    },
    "group": {
      "additionalProperties": false,
      "properties": {
        "id": {
          "description": "Optional; derived from the label when omitted.",
          "pattern": "^[a-z0-9][a-z0-9_-]{0,63}$",
          "type": "string"
        },
        "label": {
          "maxLength": 120,
          "minLength": 1,
          "type": "string"
        },
        "match": {
          "$ref": "#/$defs/filter"
        },
        "name": {
          "description": "Alias of label.",
          "maxLength": 120,
          "minLength": 1,
          "type": "string"
        },
        "placement": {
          "description": "Radial distance intent; requires layout.kind radial.",
          "enum": [
            "center",
            "inner",
            "middle",
            "outer"
          ]
        }
      },
      "required": [
        "match"
      ],
      "type": "object"
    }
  },
  "$id": "https://mnichols08.github.io/constellation/schemas/constellation-spec.v1.schema.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false,
  "description": "Semantic intent for a constellation. It names what should be emphasized, grouped, related and how it should be arranged; the Rust engine computes all geometry. It never contains coordinates, forces, code or styles.",
  "properties": {
    "focus": {
      "additionalProperties": false,
      "description": "What sits nearest the centre.",
      "properties": {
        "kind": {
          "enum": [
            "language",
            "topic",
            "role",
            "repository",
            "group"
          ]
        },
        "value": {
          "maxLength": 200,
          "minLength": 1,
          "type": "string"
        }
      },
      "required": [
        "kind",
        "value"
      ],
      "type": "object"
    },
    "groups": {
      "items": {
        "$ref": "#/$defs/group"
      },
      "maxItems": 32,
      "type": "array"
    },
    "layout": {
      "additionalProperties": false,
      "properties": {
        "cluster_by": {
          "default": [
            "language"
          ],
          "items": {
            "enum": [
              "language",
              "topic",
              "role",
              "group"
            ]
          },
          "maxItems": 3,
          "type": "array"
        },
        "kind": {
          "default": "radial",
          "enum": [
            "radial",
            "clustered",
            "solar_system",
            "web",
            "timeline"
          ]
        }
      },
      "type": "object"
    },
    "ranking": {
      "additionalProperties": false,
      "properties": {
        "by": {
          "default": "stars",
          "enum": [
            "stars",
            "recency",
            "name"
          ]
        },
        "limit": {
          "maximum": 2048,
          "minimum": 1,
          "type": "integer"
        }
      },
      "type": "object"
    },
    "relationships": {
      "description": "What connects repositories and how much each basis matters. Default: shared_language at 1.",
      "items": {
        "additionalProperties": false,
        "properties": {
          "basis": {
            "enum": [
              "shared_language",
              "shared_topic"
            ]
          },
          "strength": {
            "default": 1,
            "maximum": 1,
            "minimum": 0,
            "type": "number"
          }
        },
        "required": [
          "basis"
        ],
        "type": "object"
      },
      "maxItems": 8,
      "type": "array"
    },
    "schema_version": {
      "enum": [
        1
      ]
    },
    "style": {
      "additionalProperties": false,
      "description": "Presentation hints only.",
      "properties": {
        "motion": {
          "enum": [
            "still",
            "gentle",
            "lively"
          ]
        },
        "orbit_shape": {
          "enum": [
            "round",
            "wide"
          ]
        },
        "rings": {
          "type": "boolean"
        }
      },
      "type": "object"
    }
  },
  "required": [
    "schema_version"
  ],
  "title": "ConstellationSpec",
  "type": "object"
};
export const toolDefinitions = {
  "spec_schema": "https://mnichols08.github.io/constellation/schemas/constellation-spec.v1.schema.json",
  "tools": [
    {
      "description": "List the languages present in the loaded repositories, with how many repositories use each. Call before naming a language.",
      "input_schema": {
        "additionalProperties": false,
        "properties": {},
        "type": "object"
      },
      "name": "list_languages"
    },
    {
      "description": "List the topics present in the loaded repositories, with how many repositories carry each. Call before naming a topic.",
      "input_schema": {
        "additionalProperties": false,
        "properties": {},
        "type": "object"
      },
      "name": "list_topics"
    },
    {
      "description": "Find repositories matching a filter. Returns stable repository ids with the evidence that matched. Results are bounded.",
      "input_schema": {
        "$defs": {
          "filter": {
            "additionalProperties": false,
            "description": "Repository filter. One key per object is canonical; several keys mean all must hold. Nesting depth and total conditions are bounded.",
            "minProperties": 1,
            "properties": {
              "all": {
                "items": {
                  "$ref": "#/$defs/filter"
                },
                "maxItems": 64,
                "minItems": 1,
                "type": "array"
              },
              "any": {
                "items": {
                  "$ref": "#/$defs/filter"
                },
                "maxItems": 64,
                "minItems": 1,
                "type": "array"
              },
              "archived": {
                "type": "boolean"
              },
              "fork": {
                "type": "boolean"
              },
              "language": {
                "maxLength": 120,
                "minLength": 1,
                "type": "string"
              },
              "not": {
                "$ref": "#/$defs/filter"
              },
              "repository": {
                "description": "A repository id returned by a discovery tool.",
                "maxLength": 200,
                "minLength": 1,
                "type": "string"
              },
              "role": {
                "enum": [
                  "featured",
                  "supporting",
                  "experimental",
                  "historical",
                  "unassigned"
                ]
              },
              "stars": {
                "additionalProperties": false,
                "minProperties": 1,
                "properties": {
                  "max": {
                    "maximum": 100000000,
                    "minimum": 0,
                    "type": "integer"
                  },
                  "min": {
                    "maximum": 100000000,
                    "minimum": 0,
                    "type": "integer"
                  }
                },
                "type": "object"
              },
              "topic": {
                "maxLength": 120,
                "minLength": 1,
                "type": "string"
              },
              "updated": {
                "additionalProperties": false,
                "description": "Days between the repository's last update and the evidence reference date.",
                "minProperties": 1,
                "properties": {
                  "older_than_days": {
                    "maximum": 36500,
                    "minimum": 0,
                    "type": "integer"
                  },
                  "within_days": {
                    "maximum": 36500,
                    "minimum": 0,
                    "type": "integer"
                  }
                },
                "type": "object"
              }
            },
            "type": "object"
          }
        },
        "additionalProperties": false,
        "properties": {
          "filter": {
            "$ref": "#/$defs/filter"
          },
          "limit": {
            "default": 20,
            "maximum": 50,
            "minimum": 1,
            "type": "integer"
          }
        },
        "required": [
          "filter"
        ],
        "type": "object"
      },
      "name": "find_repositories"
    },
    {
      "description": "Describe one repository's evidence: languages, topics, curated role, stars and recency.",
      "input_schema": {
        "additionalProperties": false,
        "properties": {
          "id": {
            "maxLength": 200,
            "minLength": 1,
            "type": "string"
          }
        },
        "required": [
          "id"
        ],
        "type": "object"
      },
      "name": "describe_repository"
    },
    {
      "description": "Check which repositories a group would contain, with reasons, without changing anything.",
      "input_schema": {
        "$defs": {
          "filter": {
            "additionalProperties": false,
            "description": "Repository filter. One key per object is canonical; several keys mean all must hold. Nesting depth and total conditions are bounded.",
            "minProperties": 1,
            "properties": {
              "all": {
                "items": {
                  "$ref": "#/$defs/filter"
                },
                "maxItems": 64,
                "minItems": 1,
                "type": "array"
              },
              "any": {
                "items": {
                  "$ref": "#/$defs/filter"
                },
                "maxItems": 64,
                "minItems": 1,
                "type": "array"
              },
              "archived": {
                "type": "boolean"
              },
              "fork": {
                "type": "boolean"
              },
              "language": {
                "maxLength": 120,
                "minLength": 1,
                "type": "string"
              },
              "not": {
                "$ref": "#/$defs/filter"
              },
              "repository": {
                "description": "A repository id returned by a discovery tool.",
                "maxLength": 200,
                "minLength": 1,
                "type": "string"
              },
              "role": {
                "enum": [
                  "featured",
                  "supporting",
                  "experimental",
                  "historical",
                  "unassigned"
                ]
              },
              "stars": {
                "additionalProperties": false,
                "minProperties": 1,
                "properties": {
                  "max": {
                    "maximum": 100000000,
                    "minimum": 0,
                    "type": "integer"
                  },
                  "min": {
                    "maximum": 100000000,
                    "minimum": 0,
                    "type": "integer"
                  }
                },
                "type": "object"
              },
              "topic": {
                "maxLength": 120,
                "minLength": 1,
                "type": "string"
              },
              "updated": {
                "additionalProperties": false,
                "description": "Days between the repository's last update and the evidence reference date.",
                "minProperties": 1,
                "properties": {
                  "older_than_days": {
                    "maximum": 36500,
                    "minimum": 0,
                    "type": "integer"
                  },
                  "within_days": {
                    "maximum": 36500,
                    "minimum": 0,
                    "type": "integer"
                  }
                },
                "type": "object"
              }
            },
            "type": "object"
          },
          "group": {
            "additionalProperties": false,
            "properties": {
              "id": {
                "description": "Optional; derived from the label when omitted.",
                "pattern": "^[a-z0-9][a-z0-9_-]{0,63}$",
                "type": "string"
              },
              "label": {
                "maxLength": 120,
                "minLength": 1,
                "type": "string"
              },
              "match": {
                "$ref": "#/$defs/filter"
              },
              "name": {
                "description": "Alias of label.",
                "maxLength": 120,
                "minLength": 1,
                "type": "string"
              },
              "placement": {
                "description": "Radial distance intent; requires layout.kind radial.",
                "enum": [
                  "center",
                  "inner",
                  "middle",
                  "outer"
                ]
              }
            },
            "required": [
              "match"
            ],
            "type": "object"
          }
        },
        "additionalProperties": false,
        "properties": {
          "group": {
            "$ref": "#/$defs/group"
          },
          "limit": {
            "default": 20,
            "maximum": 50,
            "minimum": 1,
            "type": "integer"
          }
        },
        "required": [
          "group"
        ],
        "type": "object"
      },
      "name": "preview_group"
    },
    {
      "description": "Validate a ConstellationSpec against the schema and the loaded repositories. Returns the normalized spec or structured diagnostics. Builds nothing.",
      "input_schema": {
        "additionalProperties": false,
        "properties": {
          "spec": {
            "$ref": "https://mnichols08.github.io/constellation/schemas/constellation-spec.v1.schema.json"
          }
        },
        "required": [
          "spec"
        ],
        "type": "object"
      },
      "name": "validate_spec"
    },
    {
      "description": "Compile a valid ConstellationSpec into resolved groups, placement bands and relationships. The engine computes all geometry.",
      "input_schema": {
        "additionalProperties": false,
        "properties": {
          "spec": {
            "$ref": "https://mnichols08.github.io/constellation/schemas/constellation-spec.v1.schema.json"
          }
        },
        "required": [
          "spec"
        ],
        "type": "object"
      },
      "name": "compile_spec"
    }
  ],
  "version": 1
};
