/*
 * products.js — EDITABLE PRODUCT CONFIGURATION
 * ---------------------------------------------------------------------------
 * Ultraplast Smart Conveyor Planner & Estimator
 *
 * This is the ONLY file an authorised developer needs to edit to change product
 * options, published specifications, or company contact details.
 *
 * RULES
 *  - Every technical value carries { verified: false } until an Ultraplast
 *    engineer has confirmed it. The app labels unverified values as
 *    "Configuration-dependent" and never presents them as design data.
 *  - Use `null` for anything not known. The calculator then says
 *    "Engineering review required" instead of guessing.
 *  - Do NOT add prices here. Pricing is intentionally not part of this app.
 *
 * Values below were read from the public Ultraplast pages listed in `sources`
 * on 2026-10-13. They are REFERENCE INFORMATION ONLY and must be re-verified
 * (see docs/VERIFICATION_CHECKLIST.md).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.UCPProducts = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SRC_MODULAR = 'https://www.ultraplastindia.com/straight-run-and-modular-conveyor-belts/';
  var SRC_SYSTEM = 'https://www.ultraplastindia.com/conveyor-system/';
  var SRC_BELTS = 'https://www.ultraplastindia.com/conveyor-belts-and-chains/';

  function spec(value, unit, source, note) {
    return { value: value, unit: unit || null, source: source || null, verified: false, note: note || null };
  }

  return {
    meta: {
      configVersion: '0.1.0',
      publishedSpecsReadOn: '2026-10-13',
      verifiedBy: null,          // e.g. 'A. Sharma, Design Dept.'
      verifiedOn: null,          // e.g. '2026-11-02'
      sources: [SRC_SYSTEM, SRC_BELTS, SRC_MODULAR]
    },

    company: {
      name: 'Ultraplast Chainbelts Private Limited',
      shortName: 'Ultraplast',
      website: 'https://www.ultraplastindia.com/',
      logoUrl: 'https://www.ultraplastindia.com/wp-content/uploads/2024/10/Ultra-Plast-Logo-For-Website.png',
      // Published on the Ultraplast "conveyor-system" page (2026-10-13). Re-verify before launch.
      enquiryEmail: 'info@ultraplastindia.in',
      phones: ['+91-129-4010031', '+91-9810060473', '+91-9205246473'],
      address: 'Works Plot-627, Sector-69, IMT, Faridabad-121004, Haryana, India',
      hours: 'Monday-Saturday, 9 AM-6 PM',
      // WhatsApp: the website mentions a WhatsApp option but does not show a number.
      // Leave null until the company confirms its official WhatsApp number, then
      // enter digits only with country code, e.g. '919810060473'.
      whatsappNumber: null,
      whatsappVerified: false
    },

    industries: [
      { id: 'beverages', label: 'Beverages and bottling' },
      { id: 'dairy', label: 'Dairy' },
      { id: 'food', label: 'Food processing' },
      { id: 'bakery', label: 'Bakery and snacks' },
      { id: 'meat', label: 'Meat and seafood' },
      { id: 'fmcg', label: 'FMCG and packaging' },
      { id: 'pharma', label: 'Pharmaceuticals' },
      { id: 'warehouse', label: 'Warehousing and logistics' },
      { id: 'engineering', label: 'Automotive, tyres and general engineering' },
      { id: 'other', label: 'Other' }
    ],

    // How the product is presented to the conveyor (drives the recommendation logic).
    handlingTypes: [
      { id: 'bottles', label: 'Bottles, cans, jars, containers' },
      { id: 'cartons', label: 'Cartons, boxes, totes (rigid flat base)' },
      { id: 'bags', label: 'Bags, pouches, soft packs' },
      { id: 'trays', label: 'Trays, tubs, cups' },
      { id: 'loose_food', label: 'Unpacked food items' },
      { id: 'small_parts', label: 'Small parts / components' },
      { id: 'heavy', label: 'Heavy items (tyres, castings, drums)' },
      { id: 'other', label: 'Other / not sure' }
    ],

    materials: [
      { id: 'unknown', label: 'Not sure - recommend' },
      { id: 'pp_modular', label: 'Polypropylene (PP) modular belt' },
      { id: 'plastic_other', label: 'Other thermoplastic (acetal / POM etc.)' },
      { id: 'ss304', label: 'Stainless steel SS 304 slat chain' },
      { id: 'pu_pvc', label: 'PU / PVC food-grade belt' },
      { id: 'steel_roller', label: 'Steel / zinc-plated rollers' }
    ],

    /*
     * Published belt / chain families. `null` = not published.
     * widthMm / pitchMm / minRadius are reference values only.
     */
    families: {
      plastic_modular: {
        label: 'PP plastic modular belt (UMB-50 / UMB-38 / UMB-25)',
        widthMm: { min: spec(150, 'mm', SRC_MODULAR), max: spec(2500, 'mm', SRC_MODULAR) },
        // The site lists pitch "28/38/50 mm" but the model numbers read 25/38/50.
        // The 25-vs-28 mismatch MUST be resolved by Ultraplast before use.
        pitchOptionsMm: spec([25, 38, 50], 'mm', SRC_MODULAR, 'Site text says 28/38/50 mm; model numbers say 25/38/50. Resolve before launch.'),
        sprocketTeeth: spec(8, null, SRC_MODULAR),
        pinDiameterMm: spec(8, 'mm', SRC_MODULAR),
        tensileLoadKg: spec({ min: 600, max: 1200 }, 'kg', SRC_MODULAR, 'Published as "tensile load"; basis / safety factor unknown.'),
        minSideFlexRadius: null,
        moduleLengthMm: null
      },
      side_flex_plastic: {
        label: 'Side-flex plastic modular belt',
        widthMm: { min: spec(100, 'mm', SRC_MODULAR), max: spec(900, 'mm', SRC_MODULAR) },
        pitchOptionsMm: null,
        sprocketTeeth: spec(8, null, SRC_MODULAR),
        pinDiameterMm: spec(6, 'mm', SRC_MODULAR),
        // Published as "turning radius approx. 2.6 x belt width". Whether this is inside,
        // centreline or outside radius is NOT stated. App compares conservatively and flags it.
        minSideFlexRadius: { factorOfWidth: spec(2.6, 'x width', SRC_MODULAR, 'Radius reference (inside/centre/outside) not stated.'), fixedMm: null },
        moduleLengthMm: null
      },
      ss_tab_flex: {
        label: 'Stainless steel tab-flex / magnet-flex side-flexing chain',
        widthMm: null,
        pitchOptionsMm: spec([38.1], 'mm', SRC_MODULAR, '1.5 inch'),
        sprocketTeeth: null,
        pinDiameterMm: null,
        minSideFlexRadius: { factorOfWidth: null, fixedMm: spec(500, 'mm', SRC_MODULAR, 'Published as minimum side-flex radius R.') },
        moduleLengthMm: null
      },
      ss_slat: {
        label: 'Stainless steel SS 304 slat chain (single / double hinge)',
        widthMm: { min: spec(82.55, 'mm', SRC_MODULAR, '3.25 inch'), max: spec(190.5, 'mm', SRC_MODULAR, '7.5 inch') },
        pitchOptionsMm: spec([38.1], 'mm', SRC_MODULAR, '1.5 inch'),
        sprocketTeeth: null,
        pinDiameterMm: null,
        minSideFlexRadius: null,
        moduleLengthMm: null
      }
    },

    /*
     * Conveyor categories requested by Ultraplast.
     * supportsCurves / supportsIncline: true | false | null (null = unknown -> review).
     * These flags describe the NATURE of the category (e.g. a curved conveyor curves)
     * and are not a capability claim for any particular model.
     */
    categories: [
      {
        id: 'straight_modular', name: 'Straight-running modular belt conveyor', kind: 'belt', powered: true,
        families: ['plastic_modular'], supportsCurves: false, supportsIncline: null,
        summary: 'Flat plastic modular belt running in a straight line between drive and idler ends.'
      },
      {
        id: 'thermoplastic_slat', name: 'Thermoplastic slat chain conveyor', kind: 'chain', powered: true,
        families: [], supportsCurves: false, supportsIncline: null,
        summary: 'Slat-chain conveyor, commonly used for bottles, cans and containers. No technical data is configured yet.'
      },
      {
        id: 'food_pu_pvc', name: 'Food-grade PU/PVC belt conveyor', kind: 'belt', powered: true,
        families: [], supportsCurves: false, supportsIncline: null,
        summary: 'Smooth-surface food-grade belt conveyor for hygienic applications. No technical data is configured yet.'
      },
      {
        id: 'side_flex', name: 'Side-flexing chain conveyor', kind: 'chain', powered: true,
        families: ['side_flex_plastic', 'ss_tab_flex'], supportsCurves: true, supportsIncline: null,
        summary: 'Chain or belt that bends sideways so one conveyor can follow curves and turns.'
      },
      {
        id: 'curved', name: 'Curved conveyor', kind: 'belt', powered: true,
        families: [], supportsCurves: true, supportsIncline: null,
        summary: 'Powered conveyor section that turns the product through an angle (for example 45, 90 or 180 degrees).'
      },
      {
        id: 'inclined', name: 'Inclined conveyor', kind: 'belt', powered: true,
        families: [], supportsCurves: null, supportsIncline: true,
        summary: 'Conveyor that raises or lowers product between two heights. Surface profile / cleats depend on the product.'
      },
      {
        id: 'gravity_roller', name: 'Gravity roller conveyor', kind: 'roller', powered: false,
        families: [], supportsCurves: null, supportsIncline: null,
        summary: 'Unpowered roller conveyor; product moves by hand push or a slight downward slope.'
      },
      {
        id: 'powered_roller', name: 'Powered roller conveyor', kind: 'roller', powered: true,
        families: [], supportsCurves: false, supportsIncline: null,
        summary: 'Driven rollers for cartons, totes and other rigid flat-base loads.'
      },
      {
        id: 'powered_curved_roller', name: 'Powered curved roller conveyor', kind: 'roller', powered: true,
        families: [], supportsCurves: true, supportsIncline: null,
        summary: 'Driven tapered-roller curve for rigid flat-base loads.'
      },
      {
        id: 'custom', name: 'Custom conveyor / integrated production line', kind: 'system', powered: true,
        families: [], supportsCurves: true, supportsIncline: true,
        summary: 'Engineered combination of conveyors, transfers and accessories to suit a full production line.'
      }
    ],

    /*
     * Items that need data from Ultraplast engineering. Set a number to let the app
     * compute the matching quantity; leave null to keep it "to be engineered".
     */
    engineering: {
      moduleLengthMm: null,           // standard frame module length
      legSpacingMm: null,             // support-leg spacing
      widthAllowancePerSideMm: null,  // clearance + guide allowance added each side of product envelope
      maxInclineDeg: null,            // max incline per product / surface
      maxSpeedMPerMin: null           // max speed per product
    }
  };
});
