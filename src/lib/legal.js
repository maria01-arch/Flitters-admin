// Draft text for review by a lawyer. Items in [brackets] must be decided with them.
export const UPDATED = '1 November 2026 (draft)'

export const TERMS = [
  { h: '1. About these terms', p: ['Flitters Ads is run by Xchord Labs (“we”, “us”). When you create an account, publish a campaign or pay, you agree to these terms, the Ad Policy, the Refund Policy and the Privacy Policy.'] },
  { h: '2. Your account', ul: ['You must give accurate information and be old enough to make a binding contract where you live.', 'You must be allowed to advertise for the business you enter.', 'You are responsible for everything done through your account. Keep your password private.'] },
  { h: '3. Ads and review', p: ['We review every ad before it runs. We aim to decide within 24 hours, but this is a target, not a promise. We may reject, pause or remove any ad that breaks the Ad Policy or the law. Approval is not an endorsement of your business.'] },
  { h: '4. Your content', p: ['You keep ownership of the pictures, videos and text you upload. You confirm you have the right to use them, and that they do not infringe anyone else’s rights. You give us permission to store and show your content in Flitters for as long as your campaign runs, and to keep copies for records and safety.'] },
  { h: '5. Prices and payment', ul: ['The price per day is shown before you pay. Prices are in Nigerian naira (NGN) for advertisers in Nigeria and US dollars (USD) elsewhere.', 'VAT is added where it applies, and shown separately.', 'Payments are handled by Paystack. We never see or store your card details.', 'Once you have paid, the price, dates and placement of that campaign do not change.'] },
  { h: '6. Running your campaign', p: ['Your campaign runs on the dates you chose, once approved. We do not promise any number of views, clicks or sales. If you pause a campaign, the days still count unless we say otherwise in writing.'] },
  { h: '7. Refunds', p: ['See the Refund Policy.'] },
  { h: '8. Suspension and removal', p: ['We may suspend your account or remove ads if you break these terms, the Ad Policy or the law, or if we reasonably believe an ad could cause harm.'] },
  { h: '9. Limits on our responsibility', p: ['To the fullest extent the law allows, we are not responsible for indirect or lost-profit losses. Our total responsibility for a campaign is limited to the amount you paid for that campaign. [Lawyer to confirm wording.]'] },
  { h: '10. Changes', p: ['We may update these terms. We will tell you about important changes. If you keep using Flitters Ads after a change, you accept it.'] },
  { h: '11. Governing law', p: ['[To be set with your lawyer, for example the laws of the Federal Republic of Nigeria, and which courts decide disputes.]'] },
]

export const AD_POLICY = [
  { h: 'The basics', p: ['Ads must be honest, legal and safe for a general audience, including young people. Every ad is reviewed by a person before it runs.'] },
  { h: 'Not allowed', ul: [
    'Anything illegal, or that helps people break the law.',
    'Sexual or adult content, nudity, or content that sexualises anyone, and any content that exploits or endangers children.',
    'Violence, threats, hate or harassment, or content that attacks people for who they are.',
    'Weapons, explosives, illegal drugs and drug paraphernalia.',
    'Scams and misleading offers: fake prizes, pyramid schemes, “get rich quick”, fake investments or fake discounts.',
    'False or exaggerated claims, especially about health, money or results.',
    'Counterfeit goods, and content that copies someone else’s brand, work or identity.',
    'Malware, phishing, or links that collect personal data without saying so.',
    'Self-harm, eating-disorder or similar harmful content.',
  ] },
  { h: 'Needs extra care', p: ['Ads for alcohol, financial services, health products, gambling, political topics and similar areas may be refused, or we may ask for proof that you are allowed to advertise them. [Lawyer: list the categories and local rules that apply.]'] },
  { h: 'Quality rules', ul: ['The link must start with https:// and open the business or product shown in the ad.', 'The text and picture must match what you really offer.', 'No misleading buttons, fake play buttons or fake system messages.', 'No text that is mostly capital letters, and no spam.'] },
  { h: 'File and size limits', ul: ['Feed ads: one image (JPG, PNG or WebP), up to 4 MB.', 'Reels ads: one MP4 video, up to 30 seconds and 30 MB.', 'Text up to 300 characters. Button text up to 24 characters.'] },
  { h: 'What happens if an ad breaks the rules', p: ['We may reject the ad and tell you why, so you can fix it and send it again. We may remove a running ad, and repeated or serious breaches may lead to account suspension. Removal for breaking this policy is not refunded.'] },
]

export const REFUNDS = [
  { h: 'When you can get a refund', ul: [
    'Before review: if you cancel before we start reviewing your ad, you get a full refund.',
    'Ad not approved: if we reject your ad and you do not fix and send it again within 7 days, you can ask for a full refund.',
    'Our fault: if we take your ad down for a reason that is not your fault, you get back the days that did not run.',
  ] },
  { h: 'When you cannot', ul: [
    'Days that have already run are not refunded.',
    'If we remove your ad for breaking the Ad Policy or the law, there is no refund.',
    'We cannot refund because an ad got fewer views, clicks or sales than you hoped. We do not promise results.',
  ] },
  { h: 'How refunds are paid', p: ['Refunds go back to the original payment method through Paystack. Banks can take several days to show them. VAT is refunded with the amount it was charged on. Currency conversion by your bank is outside our control.'] },
  { h: 'How to ask', p: ['Contact support with your campaign name. We will answer within a few working days. [Lawyer: confirm refund wording against consumer rules that apply.]'] },
]

export const PRIVACY = [
  { h: 'What we collect', ul: ['Your sign-in email and password (the password is stored securely by our login provider).', 'Your business name, country and contact email.', 'The campaigns you create: pictures, videos, text, links and dates.', 'Payment records: amount, currency, reference and time. Card details go straight to Paystack and are never stored by us.', 'Basic usage numbers for your ads: views and clicks.'] },
  { h: 'How we use it', ul: ['To run your account and campaigns, review ads and keep Flitters safe.', 'To take payment, send receipts and keep invoices.', 'To contact you about your account and ad decisions.', 'To follow the law and keep records.'] },
  { h: 'Who sees it', p: ['Our staff can see your business details and campaigns to review them and give support. Your ad content is shown to Flitters users while it runs. We share payment details with Paystack to take payment, and we use email and hosting providers to run the service. We do not sell your data.'] },
  { h: 'How long we keep it', p: ['We keep account and payment records for as long as needed for your account and for tax and legal reasons. [Lawyer: set exact periods.]'] },
  { h: 'Your choices', p: ['You can ask to see, correct or delete your information, and we will help unless the law requires us to keep it. [Lawyer: confirm obligations under Nigeria’s data protection law and any other law that applies to your advertisers.]'] },
  { h: 'Security', p: ['We use secure connections, limit who can reach your data, and keep a record of staff actions. No system is perfectly safe, so please use a strong password.'] },
]
