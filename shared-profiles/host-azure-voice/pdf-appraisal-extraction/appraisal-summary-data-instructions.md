# Appraisal Summary Data Extraction Instructions

Extract structured appraisal-summary data from the uploaded property appraisal PDF document or documents.

## Goal
For each uploaded appraisal PDF, produce one structured record that can be used to populate the HTML template placeholders in the appraisal summary report.

## Source of Truth
- Use only the uploaded appraisal PDF documents.
- Do not infer facts that are not supported by the document.
- If a field is not present in the appraisal, return "Not Included".
- If the appraisal appears to address the field but the exact answer is still unclear, return "Unknown".
- Preserve the original wording when the document gives a direct answer.
- When numeric acreage values are present, return the value exactly as shown in the appraisal when practical, including units if they are part of the stated value.

## Output Format
Return only a JSON array.
Do not wrap the JSON in markdown fences.
Do not add commentary before or after the JSON.

Each array item must represent one uploaded appraisal PDF and must contain these properties exactly:

```json
[
  {
    "File #": { "value": "", "pageNumber": "" },
    "Client": { "value": "", "pageNumber": "" },
    "State": { "value": "", "pageNumber": "" },
    "County": { "value": "", "pageNumber": "" },
    "Total Acres": { "value": "", "pageNumber": "" },
    "Cropland Acres": { "value": "", "pageNumber": "" },
    "Originating Bank/Agri-Access": { "value": "", "pageNumber": "" },
    "Purpose and Intent for Lending": { "value": "", "pageNumber": "" },
    "Engagement Letter Included": { "value": "", "pageNumber": "" },
    "Legal Description Included": { "value": "", "pageNumber": "" },
    "Legal and Physical Access from Public Right-of-Way": { "value": "", "pageNumber": "" },
    "Tax Parcel Numbers Included": { "value": "", "pageNumber": "" },
    "Pictures of Subject Property Included": { "value": "", "pageNumber": "" },
    "Aerial Maps Included": { "value": "", "pageNumber": "" },
    "Improvements on Subject Property Included": { "value": "", "pageNumber": "" },
    "Value Given for Improvements Included": { "value": "", "pageNumber": "" },
    "Irrigated Included": { "value": "", "pageNumber": "" },
    "Easements/Leases/Restrictions/Covenants Included": { "value": "", "pageNumber": "" },
    "Highest and Best Use as Vacant": { "value": "", "pageNumber": "" },
    "Highest and Best Use as Improved": { "value": "", "pageNumber": "" }
  }
]
```

For every field:
- `value` is the extracted answer.
- `pageNumber` is the appraisal document page number where that answer was found.

## Field Extraction Rules
1. "File #": extract the appraisal file number.
2. "Client": extract the client name.
3. "State": extract the property state.
4. "County": extract the property county.
5. "Total Acres": extract the total acreage for the subject property.
6. "Cropland Acres": extract cropland or tillable cropland acreage.
7. "Originating Bank/Agri-Access": extract the originating bank and/or Agri-Access information.
8. "Purpose and Intent for Lending": answer whether the purpose and intent indicate lending purposes, using the document wording when available.
9. "Engagement Letter Included": answer whether an engagement letter is included.
10. "Legal Description Included": answer whether the legal description is included.
11. "Legal and Physical Access from Public Right-of-Way": answer whether legal and physical access from a public right-of-way is included or stated.
12. "Tax Parcel Numbers Included": answer whether tax parcel numbers are included.
13. "Pictures of Subject Property Included": answer whether pictures of the subject property are included.
14. "Aerial Maps Included": answer whether aerial maps are included.
15. "Improvements on Subject Property Included": answer whether improvements are present on the subject property.
16. "Value Given for Improvements Included": answer whether value is given for the improvements.
17. "Irrigated Included": answer whether the subject property is irrigated.
18. "Easements/Leases/Restrictions/Covenants Included": answer whether easements, leases, restrictions, or covenants are identified.
19. "Highest and Best Use as Vacant": extract the highest and best use conclusion as vacant.
20. "Highest and Best Use as Improved": extract the highest and best use conclusion as improved.

For each field's `pageNumber`:
- Return the appraisal's logical page number, not the raw PDF file index.
- Use the table of contents together with the PDF page order to determine the correct logical page when the printed page number is not obvious on the page itself.
- Account for any cover pages, letters, or other front matter that may appear before the table of contents or before the numbered appraisal pages.
- If the answer is on multiple pages, return the primary page where the clearest supporting statement appears.
- If the field value is `Not Included`, return `Not Included` for `pageNumber`.
- If the field value is `Unknown` because the document is unclear, return `Unknown` for `pageNumber`.

## Multi-Document Handling
- Produce one JSON object per uploaded appraisal PDF.
- Keep the output order aligned with the uploaded-document order when possible.
- Do not merge multiple appraisals into one object.

## Quality Bar
- Prefer exact document-backed answers over normalization.
- Keep values concise enough to fit naturally into the HTML summary template.
- Return valid JSON only.
