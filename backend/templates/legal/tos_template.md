> **AI-GENERATED DRAFT — NOT LEGAL ADVICE.**
>
> This Terms of Service draft was assembled by an automated system from a
> vetted skeleton. It is a starting point only. Have a licensed attorney in
> each applicable jurisdiction review and adapt it before publishing or
> relying on it. PROMETHEUS makes no representations about its legal
> sufficiency for any particular use case, business model, or jurisdiction.

# Terms of Service

**Company:** {{ company_name }}
{% if controller_address and controller_address != "TBD" %}**Registered address:** {{ controller_address }}
{% endif %}**Contact:** {{ controller_email }}
**Effective date:** {{ effective_date }}

## 1. Definitions

In these Terms, the following capitalised words have the meanings set out
below:

- **"Service"** — the products, websites, applications, APIs, and related
  services made available by {{ company_name }} ("**we**", "**us**",
  "**our**").
- **"User"**, **"You"** — any natural person or legal entity that accesses
  or uses the Service.
- **"Account"** — the credentialed identity associated with a User.
- **"Content"** — text, files, audio, video, images, code, prompts, and any
  other materials submitted to or generated through the Service.

## 2. Acceptance of Terms

By creating an Account or accessing the Service, you confirm that:
(a) you have read and accept these Terms;
(b) you have the legal capacity to enter into a binding contract; and
(c) you will comply with all applicable laws.

If you are accepting these Terms on behalf of an organisation, you
represent that you have authority to bind that organisation, in which case
"You" refers to that organisation.

## 3. Account, Eligibility, Security

You must provide accurate registration information and keep it current. You
are responsible for activity occurring under your Account and for
maintaining the confidentiality of your credentials. Notify us promptly of
any unauthorised access at {{ controller_email }}.

The Service is not directed at children under 13 (or under 16 in the EEA
and UK). We do not knowingly collect personal data from such persons.

## 4. License

Subject to these Terms, we grant you a non-exclusive, non-transferable,
revocable licence to use the Service for your internal business or personal
use. We reserve all rights not expressly granted.

## 5. Acceptable Use

You agree not to:

- violate any law or third-party right;
- attempt to reverse engineer, decompile, or circumvent technical measures;
- use the Service to send spam, malware, or to harass any person;
- use the Service to generate or disseminate content that is unlawful,
  defamatory, infringing, harassing, or harmful (including CSAM, weapons
  instructions, or fraud);
- attempt to interfere with the integrity or performance of the Service or
  the data contained therein;
- use the Service to train competing AI models without our prior written
  consent.

## 6. User Content & Output

You retain all rights you have in Content you submit. You grant us a
worldwide, royalty-free licence to host, process, transmit, reproduce, and
display your Content solely as needed to operate, maintain, and improve the
Service for you.

Output generated for you (including AI-generated text, images, code, and
data) is provided "as-is". You are solely responsible for evaluating its
accuracy, suitability, and legal compliance before any use, publication, or
business decision.

## 7. Intellectual Property

The Service, including its design, code, logos, and documentation, is owned
by {{ company_name }} and its licensors. We retain all right, title, and
interest in the Service. You receive no right or licence in the Service
other than the licence in Section 4. You agree not to remove proprietary
notices.

## 8. Fees and Subscriptions

Where the Service is offered on a paid basis, fees, billing cadence, and
payment methods are described at the point of subscription. Unless stated
otherwise, fees are exclusive of taxes, are non-refundable, and renew
automatically at the end of each billing cycle until cancelled. We may
change fees with at least 30 days' notice; changes apply at your next
renewal.

## 9. Termination

You may terminate at any time by deleting your Account. We may suspend or
terminate your access if you breach these Terms or if continued provision
would expose us or other Users to legal or operational risk. Sections 6
(Output), 7 (IP), 9 (Termination), 10 (Disclaimers), 11 (Liability), 12
(Indemnification), 13 (Disputes), 14 (Governing Law), and 16 (Miscellaneous)
survive termination.

## 10. Disclaimer of Warranties

To the maximum extent permitted by law, the Service is provided **"AS IS"
and "AS AVAILABLE"** without warranties of any kind, whether express,
implied, statutory, or otherwise, including but not limited to merchantability,
fitness for a particular purpose, non-infringement, accuracy of AI output,
or uninterrupted operation.

## 11. Limitation of Liability

To the maximum extent permitted by law, neither party will be liable for
indirect, incidental, special, consequential, or punitive damages, or for
lost profits, revenues, business interruption, or data loss, even if
advised of the possibility. Our aggregate liability for any matter arising
out of or relating to the Service will not exceed the greater of (a) USD
100, or (b) the amounts you paid for the Service in the **twelve (12)
months** preceding the event giving rise to the claim.

Some jurisdictions do not allow exclusion of certain warranties or
limitation of liability; in those jurisdictions, our liability is limited
to the smallest extent permitted by law.

## 12. Indemnification

You agree to defend, indemnify, and hold harmless {{ company_name }}, its
affiliates, and personnel from any third-party claim arising from
(a) your Content, (b) your use of the Service in breach of these Terms, or
(c) your violation of any law or third-party right. We will give you
prompt notice of any claim, and you may control the defence with counsel
acceptable to us.

## 13. Dispute Resolution

{% if us %}
**For Users in the United States:**
You and {{ company_name }} agree that any dispute, claim, or controversy
arising out of or relating to these Terms or the Service will be resolved
by binding individual arbitration administered by JAMS under its
Streamlined Arbitration Rules, in San Francisco, California. The arbitrator
may award any relief a court could award. **You waive any right to
participate in a class action or class arbitration.** Either party may seek
injunctive relief in a court of competent jurisdiction for intellectual
property infringement or unauthorised use of the Service.
{% endif %}
{% if eu or uk %}
**For Users in the European Economic Area, the United Kingdom, or
Switzerland:**
Any dispute will be resolved by the competent courts of {{ controller_address or "the company's registered office" }}.
Consumers may also bring proceedings in the courts of their country of
residence. Nothing in these Terms limits a consumer's mandatory rights.
The European Commission provides an online dispute resolution platform at
https://ec.europa.eu/consumers/odr.
{% endif %}
{% if in_ %}
**For Users in India:**
Any dispute will be resolved by binding arbitration in accordance with the
Arbitration and Conciliation Act 1996, seated in {{ controller_address or "Bangalore" }}.
The language of arbitration shall be English.
{% endif %}
{% if not (us or eu or uk or in_) %}
Any dispute will be resolved by the competent courts of the jurisdiction
in which {{ company_name }} is registered, unless mandatory consumer law
provides otherwise.
{% endif %}

## 14. Governing Law

{% if us %}For Users in the US, these Terms are governed by the laws of the State
of Delaware, USA, excluding its conflict-of-laws rules.
{% elif eu %}For Users in the EEA, these Terms are governed by the laws of Ireland,
without prejudice to mandatory consumer protections in your country of
residence.
{% elif uk %}For Users in the UK, these Terms are governed by the laws of England and
Wales.
{% elif in_ %}For Users in India, these Terms are governed by the laws of India.
{% else %}These Terms are governed by the laws of the jurisdiction in which
{{ company_name }} is registered.
{% endif %}

## 15. Changes

We may update these Terms. If a change is material we will give at least
30 days' notice (e.g. by email or in-product notice). Continued use after
the effective date constitutes acceptance.

## 16. Miscellaneous

- **Entire Agreement.** These Terms (together with the Privacy Policy and
  any Order Forms) constitute the entire agreement between you and us.
- **Severability.** If any provision is held unenforceable, the remainder
  remains in effect.
- **No Waiver.** Failure to enforce a right is not a waiver.
- **Assignment.** You may not assign these Terms without our written
  consent. We may assign in connection with a merger, acquisition, or sale
  of assets.
- **Notices.** Notices to us must be sent to {{ controller_email }}. We may
  notify you via email or in-product notice.

## 17. Regulatory Annexes

{% if regulated_data %}
**Regulated-data addendum.** Because your business processes regulated
personal data (e.g. health, financial, or biometric), additional
contractual terms apply, including but not limited to a Data Processing
Addendum and (where applicable) a Business Associate Agreement. Contact
{{ controller_email }} to request executed copies.
{% endif %}
{% if eu %}
**GDPR clarification.** Where these Terms conflict with mandatory
provisions of Regulation (EU) 2016/679 (GDPR), the mandatory provisions
prevail. Our Privacy Policy describes lawful bases, retention, and your
rights.
{% endif %}
{% if us %}
**California consumer rights.** If you reside in California, see the
"Your Rights" section of our Privacy Policy for CCPA/CPRA-specific
disclosures and how to exercise your rights.
{% endif %}

## 18. Contact

Questions about these Terms? Email {{ controller_email }}{% if controller_address and controller_address != "TBD" %} or write to {{ controller_address }}{% endif %}.

---

_Business model snapshot (for review context): {{ business_model }}_
_Jurisdictions selected: {{ jurisdictions | join(', ') }}_
