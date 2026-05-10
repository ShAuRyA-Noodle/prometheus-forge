> **AI-GENERATED DRAFT — NOT LEGAL ADVICE.**
>
> This Privacy Policy draft was assembled by an automated system from a
> vetted skeleton. It is a starting point only. A licensed attorney with
> expertise in each applicable jurisdiction must review it before
> publication. PROMETHEUS makes no representations about its legal
> sufficiency. Privacy regulations change frequently — keep this document
> under regular legal review.

# Privacy Policy

**Controller:** {{ company_name }}
{% if controller_address and controller_address != "TBD" %}**Registered address:** {{ controller_address }}
{% endif %}**Privacy contact:** {{ controller_email }}
**Effective date:** {{ effective_date }}

This Privacy Policy explains what personal data we collect, why we collect
it, how we use and share it, how long we keep it, and what rights you have.
Capitalised terms not defined here have the meaning given in our Terms of
Service.

## 1. Information We Collect

We collect personal data when you create an Account, use the Service, or
interact with us directly. Categories include:

- **Identity & Contact Data** — name, email, profile picture, organisation.
- **Account Data** — authentication identifiers, role, preferences, locale.
- **Service Usage Data** — device, browser, IP address, page views, click
  events, feature flags, and approximate geolocation derived from IP.
- **Content** — prompts, files, and outputs you create or upload to the
  Service.
- **Payment Data** — billing address and (where applicable) payment method.
  Card details are processed by our payment provider (Stripe) and we do not
  store full card numbers on our systems.
- **Support & Communication Data** — messages you send to us.

{% if regulated_data %}
**Regulated-data classes.** Where your use of the Service involves
regulated categories of personal data (e.g. health, financial,
biometric, or government-issued IDs), we will only process that data
under a separate Data Processing Addendum and only for the purposes you
specify.
{% endif %}

## 2. How We Use Personal Data

We process personal data for the following purposes and on the following
lawful bases (where the GDPR or equivalent applies):

| Purpose | Lawful basis |
|---|---|
| Provide and operate the Service | Contract performance |
| Authenticate users and secure the Service | Legitimate interest, contract |
| Bill and collect fees | Contract performance |
| Improve, debug, and develop the Service | Legitimate interest |
| Send transactional notices | Contract performance |
| Send product or marketing emails (where opted in) | Consent |
| Comply with law and respond to legal process | Legal obligation |
| Defend, investigate, or prevent fraud or abuse | Legitimate interest |

We do not use your Content to train general-purpose AI models without
your explicit consent.

## 3. Sharing & Recipients

We share personal data only with:

- **Sub-processors** that help us operate the Service (cloud hosting,
  analytics, email, payments). A current list is available at
  {{ controller_email }} on request.
- **Affiliates** under common control, subject to this Policy.
- **Authorities** when required by law, after appropriate legal review.
- **Acquirers** in the event of a merger, acquisition, or asset sale,
  subject to confidentiality.

We do not sell personal data. We do not share personal data for
cross-context behavioural advertising{% if us %} (and we will honor
"Do Not Sell or Share" requests in line with the CCPA/CPRA){% endif %}.

## 4. Cookies & Similar Technologies

We use first-party cookies for authentication and core functionality, and
limited analytics cookies to understand product usage. You can manage
cookies through your browser settings; disabling some cookies may affect
the Service. Where required, we present a cookie consent banner.

## 5. Your Rights

{% if eu or uk %}
### EEA / UK rights (GDPR / UK GDPR)

You have the rights to: access (Art. 15), rectification (Art. 16),
erasure (Art. 17), restriction (Art. 18), data portability (Art. 20),
objection (Art. 21), and to withdraw consent at any time without
affecting prior lawful processing. You also have the right not to be
subject to a decision based solely on automated processing that produces
legal or similarly significant effects (Art. 22). To exercise any right,
email {{ controller_email }}. You may also lodge a complaint with your
local supervisory authority.

{% endif %}
{% if us %}
### California rights (CCPA / CPRA)

If you are a California resident, you may request:
- to know what personal information we have collected, used, disclosed,
  or sold/shared in the prior 12 months;
- to delete personal information, subject to legal exceptions;
- to correct inaccurate personal information;
- to limit use of sensitive personal information;
- to opt out of "sale" or "sharing" — even though we do not sell or
  share for cross-context behavioural advertising, we honour "Do Not
  Sell or Share" requests.
We do not discriminate against you for exercising these rights. Submit
requests to {{ controller_email }} with the subject line "CCPA Request".

{% endif %}
{% if in_ %}
### India rights (DPDP Act, 2023)

Once the Digital Personal Data Protection Act, 2023 is in force in your
case, you have the rights to access, correction, erasure, grievance
redressal, and to nominate a person to exercise rights on your behalf in
the event of incapacity. Email {{ controller_email }} with the subject
"DPDP Request".

{% endif %}
### General

For all other jurisdictions, you may exercise comparable rights provided
under your local law by emailing {{ controller_email }}. We will respond
within the time frames mandated by applicable law.

## 6. Retention

We keep personal data for as long as your Account is active and as needed
to provide the Service. After Account closure or upon a verified deletion
request, we delete or anonymise personal data within **30 days**, except
where law requires longer retention (e.g. tax, anti-fraud) or where data
is held in routine encrypted backups (which roll over within **90 days**).

For session content created in the PROMETHEUS pipeline, we apply a
**30-day TTL** to raw idea text and full agent outputs, after which the
records are tombstoned. Aggregated, non-identifying telemetry may be kept
for longer to monitor performance and abuse.

## 7. Security

We implement administrative, technical, and physical safeguards
appropriate to the risk, including encryption in transit and at rest,
least-privilege access, audit logging, vulnerability scanning, and
documented incident response. No system is perfectly secure; if we
become aware of a breach affecting your personal data, we will notify
you and any required authorities consistent with applicable law.

## 8. Children

The Service is not directed at children under 13 (or under 16 in the
EEA / UK, or as defined locally). We do not knowingly collect personal
data from such persons. If you believe a child has provided us personal
data, contact {{ controller_email }} so we can delete it.

## 9. International Data Transfers

We may process personal data in countries other than the one in which
you reside, including the United States. Where we transfer personal data
out of the EEA, UK, or Switzerland, we use **EU Standard Contractual
Clauses (2021/914)** plus supplementary measures as necessary, or another
lawful transfer mechanism. Contact {{ controller_email }} to request a
copy of the applicable transfer documentation.

## 10. Automated Decisions & AI

The Service uses third-party large language models and image generation
models. Output is probabilistic and may be inaccurate; it is provided
for informational purposes and should not be relied upon as the sole
basis for decisions with legal or similarly significant effects. You can
request human review of any automated decision affecting your Account by
emailing {{ controller_email }}.

## 11. Changes

We may update this Policy. If a change is material we will provide at
least **30 days'** notice (email or in-product notice). The "Effective
date" above will reflect the most recent revision.

## 12. Contact

Privacy questions, complaints, or requests:
**Email:** {{ controller_email }}
{% if controller_address and controller_address != "TBD" %}**Postal address:** {{ controller_address }}
{% endif %}
{% if eu %}
**EU representative (Art. 27 GDPR):** _to be appointed — contact {{ controller_email }} for current details._
{% endif %}
{% if uk %}
**UK representative (Art. 27 UK GDPR):** _to be appointed — contact {{ controller_email }} for current details._
{% endif %}

---

_Business context (for legal review): {{ business_model }}_
_Jurisdictions covered: {{ jurisdictions | join(', ') }}_
{% if data_collection %}_Data collection: enabled._{% else %}_Data collection: minimal / disabled by default._{% endif %}
