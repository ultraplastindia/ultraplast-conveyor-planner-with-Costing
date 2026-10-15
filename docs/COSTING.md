# Cost estimate (internal) - how it works

The planner ships with **no prices**. Costing is a calculator that multiplies **your own rates** by quantities taken from the conveyor the customer designed.

## Turn it on (staff only)
- Open the site with `?costing=1` at the end of the address, e.g. `https://yourname.github.io/ultraplast-conveyor-planner/?costing=1`
- Or set `costing: { enabled: true }` in `config.js` (then every visitor sees it - not recommended on the public site).
- This is a convenience switch, **not security**. Anyone who knows the address can add `?costing=1`, but they would still see only empty rates. Your rates live only in your browser unless you save a file. For a fully private tool, keep a private copy of the site for staff.

## Use it
1. Finish the wizard to the Results page, scroll to **Cost estimate (internal)**.
2. Type a **Rate** for each line (rupees per unit). The Qty shown under each box is calculated from the route; type a number in Qty to override it.
3. Change **Based on** to price a line by a different quantity (belt area, frame metres, legs, curves, fixed lot...). **Add line** for anything else; **Remove** or untick **On** to drop a line.
4. Set Wastage %, Overhead %, Margin %, Discount % and GST %.
5. **Save rate card** downloads a `.json` file; **Load rate card** reads it back next time, so you set rates once. Tick **Remember** to keep it in this browser only.
6. **Download costing CSV** opens in Excel.

## Maths
`line = rate x quantity` -> subtotal -> + wastage % -> + overhead % -> + margin % -> - discount % -> + GST % = total.
A line with no rate (or an unknown quantity) is flagged and the total says **INCOMPLETE** - it is never silently counted as zero.

## What it is not
- Not a quotation and never sent to the customer: rates are not in the PDF, the JSON summary or the enquiry.
- Quantities for legs, frame, guides and ends are indicative (from the planner, not a final design). Motor, drive, structure, controls and installation still need Ultraplast engineering; price them as lots or with manual quantities.
- If rates change often, keep one rate-card file per product family or per season and load the right one.
