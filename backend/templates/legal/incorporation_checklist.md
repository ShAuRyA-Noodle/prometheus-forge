> **AI-GENERATED DRAFT — NOT LEGAL OR TAX ADVICE.**
>
> This checklist is a starting point. Tax, structuring, and corporate
> formation decisions have downstream consequences that compound over
> years. Consult a licensed attorney AND a tax professional in each
> applicable jurisdiction before filing anything.

# Incorporation Checklist — {{ company_name }}

**Business model snapshot:** {{ business_model }}
**Jurisdictions selected:** {{ jurisdictions | join(', ') }}
{% if regulated_data %}**Regulated data:** yes — additional licensing may apply.{% endif %}

The cost and time estimates below are typical ranges for early-stage
solo / two-founder startups. Your numbers will differ.

{% if 'US-DE' in jurisdictions or 'US' in jurisdictions %}
## United States — Delaware C-Corp

The default for VC-fundable startups headquartered or fundraising in the
US.

| # | Task | Est. cost (USD) | Approx. time | Authoritative source |
|---|------|-----------------|--------------|----------------------|
| 1 | Reserve company name in Delaware | $75 | same day | https://corp.delaware.gov |
| 2 | File Certificate of Incorporation | $89 base + filing surcharges | 1-3 business days (24h expedite +$100) | https://corp.delaware.gov |
| 3 | Appoint registered agent in Delaware | $50-$300 / yr | same day | Stripe Atlas, Clerky, Harvard, Cogency |
| 4 | Adopt bylaws + initial board consent | $0 (template) — $1,500 (counsel) | 1 week | https://docs.clerky.com |
| 5 | Issue founder common stock + 83(b) elections | $0-$500 | mail 83(b) within 30 days of grant | https://www.irs.gov/forms-pubs/about-form-83-b |
| 6 | Apply for EIN (IRS) | $0 | same day online (24h fax) | https://irs.gov/businesses/employer-identification-number |
| 7 | Open business bank account | $0-$25 | 1-3 business days | Mercury, Brex, SVB, Chase Business |
| 8 | Foreign-qualify in operating state (CA, NY, etc.) | $70-$800 | 1-3 weeks | State Secretary of State |
| 9 | Register for state payroll tax (if hiring) | $0-$200 | 1 week | State EDD / DOL |
| 10 | Annual Delaware franchise tax + report | ~$450 minimum | due Mar 1 | https://corp.delaware.gov/paytaxes |

**Bundle:** Stripe Atlas charges ~$500 once + $100/yr registered agent and
covers items 1-7 in one flow. Clerky is similar at ~$799/yr. Doing it
yourself is feasible but slow and error-prone for first-time founders.

{% endif %}
{% if 'US-CA' in jurisdictions %}
## United States — California (LLC)

Useful for non-VC-track services businesses or single-founder ops. Note
the **$800/yr California minimum franchise tax** regardless of revenue.

| # | Task | Est. cost (USD) | Approx. time | Authoritative source |
|---|------|-----------------|--------------|----------------------|
| 1 | Name reservation | $10 | 1-2 weeks | https://bizfileonline.sos.ca.gov |
| 2 | File Articles of Organization (LLC-1) | $70 | 1-2 weeks | CA SOS |
| 3 | Statement of Information (Form LLC-12) | $20 | within 90 days | CA SOS |
| 4 | EIN | $0 | same day | https://irs.gov |
| 5 | CA Franchise Tax Board registration | $0 | same day | https://ftb.ca.gov |
| 6 | Operating Agreement | $0 (template) — $2,000 (counsel) | 1 week | https://www.calbar.ca.gov |
| 7 | Annual minimum tax + LLC fee | $800/yr min | due 15th of 4th month | FTB |

{% endif %}
{% if 'UK' in jurisdictions %}
## United Kingdom — Private Limited Company (Ltd)

| # | Task | Est. cost (GBP) | Approx. time | Authoritative source |
|---|------|------------------|--------------|----------------------|
| 1 | Name search | £0 | same day | https://www.gov.uk/get-information-about-a-company |
| 2 | Register company at Companies House (online) | £50 | 24h | https://www.gov.uk/limited-company-formation |
| 3 | Register for Corporation Tax (HMRC) | £0 | within 3 months of trading | https://www.gov.uk/register-for-corporation-tax |
| 4 | PAYE registration (if hiring) | £0 | 5 working days | https://www.gov.uk/register-employer |
| 5 | VAT registration (if turnover > £90,000) | £0 | up to 30 days | https://www.gov.uk/vat-registration |
| 6 | Confirmation Statement (annual) | £34 | once a year | Companies House |

{% endif %}
{% if 'EU' in jurisdictions %}
## European Union — Estonia (e-Residency / OÜ)

A common low-friction starting point for EU-resident or globally-mobile
founders. Each EU country has its own corporate form (GmbH, SAS, BV,
SRL, etc.) with materially different costs. Estonia is exemplar; consult
local counsel for your target country.

| # | Task | Est. cost (EUR) | Approx. time | Authoritative source |
|---|------|-----------------|--------------|----------------------|
| 1 | Apply for e-Residency | €100-€120 | 6-8 weeks | https://e-resident.gov.ee |
| 2 | Register OÜ | €265 (state fee) | same day after e-Residency | https://ariregister.rik.ee |
| 3 | Share capital (deferred OK for solo founders) | €2,500 (deferrable) | n/a | Estonian Companies Act |
| 4 | Address & contact person | €100-€500 / yr | n/a | local providers |
| 5 | Open EMI / bank account | €0 | 1-7 days | Wise, LHV, Revolut Business |
| 6 | VAT registration (turnover > €40,000) | €0 | within 2 weeks | https://www.emta.ee |

**Reminder:** corporate residence rules in your country of operation may
override Estonian filing benefits. Ask a tax adviser before assuming a
"one-corporation-fits-all" outcome.

{% endif %}
{% if 'IN' in jurisdictions %}
## India — Private Limited Company

| # | Task | Est. cost (INR) | Approx. time | Authoritative source |
|---|------|-----------------|--------------|----------------------|
| 1 | Digital Signature Certificate (DSC) for directors | ₹1,500-₹2,500 each | 1-2 days | Class 3 DSC providers |
| 2 | Director Identification Number (DIN) | included in SPICe+ | same day | https://www.mca.gov.in |
| 3 | Name reservation (RUN / SPICe+ Part A) | ₹1,000 | 1-2 days | https://www.mca.gov.in |
| 4 | SPICe+ Part B (incorporation) | ₹4,000-₹8,000 | 7-10 days | MCA |
| 5 | PAN + TAN | included | with SPICe+ | https://www.incometax.gov.in |
| 6 | Bank account opening | ₹0 | 5-15 days | ICICI, HDFC, Kotak |
| 7 | GST registration (turnover > ₹40 lakh / ₹20 lakh services) | ₹0 | 7 days | https://www.gst.gov.in |
| 8 | Professional tax registration (state-specific) | ₹0-₹2,500 | 7-15 days | State commercial tax |
| 9 | Annual ROC filings + statutory audit | ₹15,000-₹50,000 / yr | due Sept 30 | MCA |

{% endif %}
{% if 'SG' in jurisdictions %}
## Singapore — Private Limited (Pte Ltd)

| # | Task | Est. cost (SGD) | Approx. time | Authoritative source |
|---|------|-----------------|--------------|----------------------|
| 1 | Name application via BizFile+ | $15 | same day | https://www.bizfile.gov.sg |
| 2 | Incorporation | $300 | 1-3 days | ACRA |
| 3 | Local resident director (compliance) | $1,800-$3,000 / yr | n/a | EntrePass holders qualify |
| 4 | Corporate secretary (mandatory within 6 months) | $300-$1,500 / yr | n/a | ACRA-licensed |
| 5 | Open bank account | $0 | 2-4 weeks | DBS, OCBC, UOB, Aspire |
| 6 | GST registration (if turnover > $1m) | $0 | within 30 days | IRAS |
| 7 | Annual return + AGM | $60 filing | due 7 months from FYE | ACRA / IRAS |

{% endif %}

## Cross-jurisdiction operational items

| # | Task | Why it matters | Notes |
|---|------|----------------|-------|
| ★ | Founders' agreement / SAFE / vesting | Locks ownership, reduces co-founder disputes, fundable at fundraising | Use Y Combinator post-money SAFE templates if US |
| ★ | IP assignment from each founder + employee | A clean cap table requires the company to own its code/brand | Consider proactive contributor licence (CLA) for OSS |
| ★ | Cap table + 409A valuation (US) | Required for compliant option grants | Carta, Pulley, AngelList |
| ★ | Bookkeeping + accounting software | Tax compliance from day one, not pre-Series A | Xero, QuickBooks, Pilot |
| ★ | Privacy & ToS published before launch | Pre-empts complaints; required for app stores | See `privacy_template.md`, `tos_template.md` |
| ★ | Cyber insurance | Customer expectation by Series A | Vouch, Coalition, Embroker |
| ★ | Trademark filing for company name | After USPTO/equivalent search shows clear field | $250-$350 USPTO + $1,000-$2,500 attorney |
{% if regulated_data %}
| ⚠ | Industry-specific licensing | Required before processing regulated data | E.g. SOC 2 readiness, HIPAA BAA, PCI-DSS QSA |
{% endif %}

## What to do in the first two weeks

1. **Pick the form.** Default to Delaware C-Corp if you intend to raise
   from US VCs. Default to local Pte Ltd / Ltd / Pvt Ltd otherwise.
2. **File** through Stripe Atlas / Clerky / Companies House / MCA / ACRA
   to compress steps 1-6 into a single flow.
3. **Get the EIN / TAN / company number** so you can open a bank account.
4. **Sign the founders' agreement and 83(b) (or local equivalent) within
   30 days of issuing founder stock.** Missing this window is the most
   common irreversible mistake we see.
5. **Publish ToS + Privacy** before your first paying customer.
6. **Set up bookkeeping** before your second invoice. Cleanup later costs
   10× more than starting clean.

## Engage professionals

This list is **not exhaustive**. Engage:

- **A startup-experienced corporate attorney** (e.g. Cooley, Wilson
  Sonsini, Orrick, Latham, Gunderson, Lex Lumina, Goodwin) for company
  formation, IP assignment, and cap table.
- **A tax professional** familiar with cross-border startups for the
  flow of (a) founders' personal taxes, (b) corporate tax, (c)
  employment / equity tax in each jurisdiction you have a presence in.
- **An accountant** for monthly bookkeeping and year-end filings.

## Contact for questions

Email {{ controller_email }} for company-side queries.
For legal / tax queries, contact a licensed professional.
