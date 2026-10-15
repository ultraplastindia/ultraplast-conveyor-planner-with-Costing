# Company-specific values requiring Ultraplast engineering verification

Nothing below has been verified by Ultraplast. Values were read from public web pages on 2026-10-13
(`conveyor-system`, `straight-run-and-modular-conveyor-belts`). Edit them in `products.js`, then record
`meta.verifiedBy` / `meta.verifiedOn`. Do not launch publicly until every line is ticked or consciously left as "review".

## Published specifications used as reference (products.js -> `families`)
- [ ] PP modular belt pitch: website says "28/38/50 mm" but model numbers are UMB-**25**/38/50. Which is right? (config currently uses 25/38/50)
- [ ] PP modular belt width range 150-2500 mm
- [ ] PP modular belt "tensile load 600-1200 kg": what does it mean (per belt, per metre, safety factor)? Not used in any calculation.
- [ ] Sprocket: 8 teeth, pin dia 8 mm (PP), 6 mm (side-flex)
- [ ] Side-flex plastic belt: width 100-900 mm; "turning radius approx. 2.6 x belt width" - is it inside, centre-line or outside radius? App compares against centre-line radius.
- [ ] SS tab-flex / magnet-flex: minimum side-flex radius 500 mm (inside/centre/outside?)
- [ ] SS 304 slat chain: pitch 1.5 in (38.1 mm), width 3.25-7.5 in, plate 3 mm
- [ ] Website lists "modular belt tensile strength 140 mm" and a double-hinge chain width under an inch label - obvious data-entry errors on the site; not used.

## Values NOT published - currently `null` (app says "Engineering review required")
- [ ] Thermoplastic slat chain: pitch, widths, materials, temperature limits (category has no family data)
- [ ] Food-grade PU/PVC belt: thickness, widths, temperature, hygiene certification
- [ ] Curved conveyor, inclined conveyor, roller conveyors: sizes, radii, roller pitch, load capacity
- [ ] `engineering.moduleLengthMm` (frame module length) -> enables frame quantity
- [ ] `engineering.legSpacingMm` -> enables leg quantity
- [ ] `engineering.widthAllowancePerSideMm` -> enables recommended minimum conveyor width
- [ ] `engineering.maxInclineDeg` and cleat/profile rules per product
- [ ] `engineering.maxSpeedMPerMin` per product
- [ ] Temperature, chemical and food-contact ratings per material
- [ ] Motor, gearbox, torque, belt tension, shaft, bearing and structure sizing methods (the app deliberately does none)

## 3D view (conveyor3d.js)
- [ ] Confirm which parts may be drawn as generic shapes: side frame (section and depth), guide rails, support legs, end rollers, motor position and size - all are indicative constants in `IND` at the top of `conveyor3d.js`
- [ ] Provide real drawing data if the 3D should match a catalogue model (frame width allowance per side, leg spacing, drive position, roller diameter, belt thickness)
- [ ] Decide the standard obstacle height to show (obstacle height is not asked in the form; 1.0 m is drawn)
- [ ] Inclines are drawn as straight ramps with sharp changes of slope; real conveyors use bend radii / transitions (not specified yet)

## Recommendation rules (calculations.js -> `recommend()`)
- [ ] Review each rule: bottles/beverage -> slat chain; food + soft -> PU/PVC; rigid cartons dry -> powered roller; curves -> side-flex; etc.
- [ ] Review which categories truly support curves / inclines (`supportsCurves`, `supportsIncline` in products.js)
- [ ] Review warnings (wet/oily on rollers, sticky, abrasive, temperature outside 0-45 C)

## Company details (products.js -> `company`)
- [ ] Enquiry email info@ultraplastindia.in, phones, address and hours (read from website)
- [ ] **WhatsApp number**: not published. Set `whatsappNumber` and `whatsappVerified: true` only after the company confirms it.
- [ ] Brand red (#c8102e in styles.css) is an approximation - replace with the official brand colour
- [ ] Logo URL still valid; consider copying the logo into the repo with permission

## Legal / data
- [ ] Privacy notice and consent wording approved (India DPDP Act etc.); enquiry service data location acceptable
- [ ] Disclaimer wording approved by management
