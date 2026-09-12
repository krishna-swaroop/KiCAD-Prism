import { describe, expect, it } from "vitest";

import type { CatalogComponent, CatalogMetadataField } from "@/types/catalog";

import {
  activeMetadataFields,
  buildMetadataPatch,
  isFieldRequired,
  isMetadataFormComplete,
  metadataFormErrors,
  parseUnknownExtraJson,
  unknownExtraFields,
  validateMetadataField,
  valuesFromComponent,
} from "./library-component-metadata-form";

function metadataField(
  partial: Partial<CatalogMetadataField> & Pick<CatalogMetadataField, "key" | "label" | "storage_key">,
): CatalogMetadataField {
  return {
    id: `field-${partial.key}`,
    description: "",
    group: "core",
    type: "text",
    unit: "",
    enum_values: [],
    storage_kind: "column",
    built_in: false,
    required: false,
    display_order: 0,
    archived: false,
    created_by: "",
    updated_by: "",
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

function component(extra: Partial<CatalogComponent> = {}): CatalogComponent {
  return {
    id: "comp-a",
    value: "10k",
    manufacturer: "Yageo",
    mpn: "RC0603",
    description: "Resistor",
    datasheet_url: "https://example.test/ds",
    identity_kind: "mpn",
    extra_fields: {},
    revision_id: "rev-1",
    ...extra,
  } as CatalogComponent;
}

describe("metadata form mapping", () => {
  it("reads column and extra values through storage_key", () => {
    const fields = [
      metadataField({ key: "value", label: "Value", storage_key: "value" }),
      metadataField({
        key: "tolerance",
        label: "Tolerance",
        storage_kind: "extra",
        storage_key: "tol_pct",
      }),
    ];
    const values = valuesFromComponent(
      component({ extra_fields: { tol_pct: "1%", leftover: "keep" } }),
      fields,
    );
    expect(values).toEqual({ value: "10k", tolerance: "1%" });
    expect(unknownExtraFields(component({ extra_fields: { tol_pct: "1%", leftover: "keep" } }), fields)).toEqual({
      leftover: "keep",
    });
  });

  it("drops archived definitions and keeps their extras unknown", () => {
    const fields = activeMetadataFields([
      metadataField({ key: "value", label: "Value", storage_key: "value", display_order: 2 }),
      metadataField({
        key: "legacy",
        label: "Legacy",
        storage_kind: "extra",
        storage_key: "legacy",
        archived: true,
        display_order: 1,
      }),
    ]);
    expect(fields.map((field) => field.key)).toEqual(["value"]);
    expect(unknownExtraFields(component({ extra_fields: { legacy: "old" } }), fields)).toEqual({
      legacy: "old",
    });
  });

  it("maps custom extras and unknown leftovers into the PATCH body", () => {
    const fields = [
      metadataField({ key: "value", label: "Value", storage_key: "value" }),
      metadataField({
        key: "dielectric",
        label: "Dielectric",
        type: "number",
        storage_kind: "extra",
        storage_key: "dielectric",
      }),
      metadataField({
        key: "tolerance",
        label: "Tolerance",
        type: "enum",
        enum_values: ["1%", "5%"],
        storage_kind: "extra",
        storage_key: "tolerance",
      }),
    ];
    expect(buildMetadataPatch({
      values: { value: " 10k ", dielectric: "2.2", tolerance: "1%" },
      fields,
      unknownExtras: { leftover: "keep" },
      changeSummary: "Add custom fields",
      expectedRevisionId: "rev-at-open",
    })).toEqual({
      value: "10k",
      extra_fields: { leftover: "keep", dielectric: "2.2", tolerance: "1%" },
      change_summary: "Add custom fields",
      expected_revision_id: "rev-at-open",
    });
  });
});

describe("identity and validation rules", () => {
  const mpn = metadataField({ key: "mpn", label: "MPN", storage_key: "mpn", required: true });
  const manufacturer = metadataField({
    key: "manufacturer",
    label: "Manufacturer",
    storage_key: "manufacturer",
    required: false,
  });
  const custom = metadataField({
    key: "tolerance",
    label: "Tolerance",
    type: "enum",
    enum_values: ["1%", "5%"],
    storage_kind: "extra",
    storage_key: "tolerance",
    required: true,
  });

  it("keeps manufacturer required and MPN optional only for provisional identities", () => {
    expect(isFieldRequired(manufacturer, "provisional_ipn")).toBe(true);
    expect(isFieldRequired(mpn, "provisional_ipn")).toBe(false);
    expect(isFieldRequired(mpn, "mpn")).toBe(true);
    expect(validateMetadataField(mpn, "", "provisional_ipn")).toBe("");
    expect(validateMetadataField(mpn, "", "mpn")).toBe("Required");
  });

  it("does not block save on legacy number, URL, or enum shapes the PATCH still accepts", () => {
    const errors = metadataFormErrors(
      [
        metadataField({ key: "value", label: "Value", storage_key: "value" }),
        metadataField({ key: "mass_g", label: "Mass", type: "number", storage_key: "mass_g" }),
        metadataField({
          key: "datasheet_url",
          label: "Datasheet",
          type: "url",
          storage_key: "datasheet_url",
        }),
        custom,
      ],
      {
        value: "10k",
        mass_g: "~5",
        datasheet_url: "example.com/ds.pdf",
        tolerance: "10%",
      },
      "mpn",
      "Update",
      "{}",
    );
    expect(errors.fieldErrors).toEqual({
      value: "",
      mass_g: "",
      datasheet_url: "",
      tolerance: "",
    });
    expect(isMetadataFormComplete(errors)).toBe(true);
    expect(validateMetadataField(custom, "", "mpn")).toBe("Required");
  });

  it("blocks save when additional extras are not a JSON object", () => {
    const errors = metadataFormErrors(
      [metadataField({ key: "value", label: "Value", storage_key: "value" })],
      { value: "10k" },
      "mpn",
      "Update",
      "[]",
    );
    expect(errors.unknownExtrasError).toBe("Additional extra fields must be a JSON object.");
    expect(isMetadataFormComplete(errors)).toBe(false);
    expect(parseUnknownExtraJson('{"note":1}').ok).toBe(true);
  });
});
