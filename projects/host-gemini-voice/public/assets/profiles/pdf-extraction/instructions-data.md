### Appraisal Report Extraction Questions

Please answer the following questions based on the provided appraisal report.

1.  What is the **File #** of the appraisal report?
2.  Who is the **client**?
3.  What **state** is the property located in?
4.  What **county** is the property located in?
5.  How many **total acres**?
6.  How many acres are **cropland** or tillable cropland?
7.  Who is the **originating bank** and/or Agri-Access?
8.  Is the **purpose and intent** of the report for lending purposes?
9.  Is there an **engagement letter**?
10. Is the **legal description** of the property included in the appraisal?
11. Is there **legal and physical access** to the property from a public right-of-way?
12. Are the property **tax parcel numbers** included in the appraisal?
13. Are there **pictures** of the subject property?
14. Are there **aerial maps** of the property?
15. Are there **improvements** on the subject property?
16. If there are improvements, is there **value given**?
17. Is the subject property **irrigated**?
18. Are there any **easements, leases, restrictions or covenants** on the subject property?
19. What is the **Highest and Best use** of the property as vacant?
20. What is the **Highest and Best use** of the property as improved?

### Output Format

Return the answer in a comma separted values text format.
The first row should contain the following headers:
File #, Client, State, County, Total Acres, Cropland Acres, Originating Bank/Agri-Access, Purpose and Intent for Lending, Engagement Letter Included, Legal Description Included, Legal and Physical Access from Public Right-of-Way, Tax Parcel Numbers Included, Pictures of Subject Property Included, Aerial Maps Included, Improvements on Subject Property Included, Value Given for Improvements Included, Irrigated Included, Easements/Leases/Restrictions/Covenants Included, Highest and Best Use as Vacant, Highest and Best Use as Improved
Each data point should be in the same order as the questions above. If a data point is not included in the appraisal report, return "Not Included" for that data point. If a data point is included but the answer is unknown, return "Unknown" for that data point.
Each row of data should be on a new line. If there are multiple appraisal reports, return a new row for each report.
DON'T include any additional text or formatting in the output. Only return the CSV header and data rows as specified above.