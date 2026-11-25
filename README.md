# HFR Retirement Calculator

A browser-only retirement estimator for Huntsville Fire and Rescue members of the Retirement Systems of Alabama (RSA) Employees' Retirement System (ERS).

Every number it shows is an estimate. It is not financial, tax or legal advice. Confirm with RSA, the deferred compensation plan, the City of Huntsville benefits office and a fee-only fiduciary advisor before major decisions.

## Privacy

Everything runs in the browser. There is no backend, no account, no analytics, and the production build's Content Security Policy (`connect-src 'none'`) blocks any network request. The app asks only for month and year of birth. Saving is optional: to this device's local storage, or to a JSON file you export.

## Updating the rules each year

- **Salary schedule:** replace `src/data/salary-schedule.json` with the new public safety schedule (annual pay by grade and step) and update `fiscalYear` and `effectiveDate`. Set `colaNotInSchedule` to any raise already granted that the file does not show yet (0.02 for FY2027), or 0 if the file includes it.
- **Rules:** `src/rules/rsa-ers.json` (RSA), `src/rules/tax.json` (federal and Alabama) and `src/rules/sources.json`. Each rule has a value, unit, source, citation and status (`verified`, `user-confirmed` or `estimate`). The in-app "Rules and sources" page lists them all.

## Development

```sh
npm ci
npm run dev        # local dev server
npm test           # unit tests (calculation engine)
npm run lint
npm run build      # static site in dist/
```

The calculation engine in `src/engine/` is pure TypeScript with no UI imports. Tests in `src/engine/__tests__/` cover the pension formula (including a member's real RSA estimate letter), the promotion rule, sick leave cash vs. credit, stress credit, PLOP, survivor options, the pre-eligibility death benefit, taxes and the cash flow model.

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which tests, builds and publishes `dist/` to GitHub Pages.
