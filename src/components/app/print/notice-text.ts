/**
 * Notice wording, in the three languages a pledger in this market actually reads.
 *
 * The decision, stated once
 * ─────────────────────────
 * The notice BODY is fully translated — subject line, every operative paragraph, the schedule
 * heading and the fact labels. When the chosen language is not English, the ONE operative
 * sentence (amount, deadline, consequence) is additionally repeated in English underneath.
 *
 * Why that and not "English with a bilingual sentence": a notice before sale is the document
 * that extinguishes someone's title to their gold. If the pledger cannot read the paragraph that
 * sets the deadline, service is arguable, and a pawnbroker who loses that argument loses the
 * auction. Translating only the operative sentence leaves the sum, the pledge number and the
 * maturity date — the facts the pledger would dispute — in a language they do not read.
 *
 * Why English is still repeated: the same sheet is produced to an inspector, and in an appeal
 * heard outside the state. English is the fallback record language, not the primary one.
 *
 * Figures, dates and weights are numerals and are never translated — they must tie to the ledger
 * character for character.
 *
 * Bold is marked with **…** and rendered by <Tpl> in girvi-docs.tsx. Keeping the strings plain
 * means a shopkeeper or a lawyer can read and correct a translation without meeting JSX.
 */
import type { NoticeLang } from './loan-docs-config'

/** Every substitution a notice paragraph can take. All pre-formatted; nothing is computed here. */
export type NoticeVars = {
  pledgeNo: string
  pledgeDate: string
  principal: string
  roi: string
  dueDate: string
  asOf: string
  total: string
  totalWords: string
  principalDue: string
  interestDue: string
  months: string
  deadline: string
  days: string
}

type Phrases = {
  /** Document title, printed beside the English title in the letterhead. */
  auctionTitle: string
  demandTitle: string
  to: string
  subject: string
  noticeDate: string
  auctionSubject: string
  demandSubject: string
  /** Paragraph 1 and 2 of the auction notice. */
  auctionRecital: string
  auctionRecitalNoDue: string
  auctionPosition: string
  /** THE operative sentence. Repeated in English when lang !== 'en'. */
  auctionOperative: string
  demandRecital: string
  demandOperative: string
  scheduleTitle: string
  /** Article schedule columns. */
  colSr: string
  colArticle: string
  colPurity: string
  colGross: string
  colNet: string
  noArticles: string
  /** Demand fact table. */
  bookedOn: string
  dueOn: string
  particulars: string
  amountBooked: string
  received: string
  balance: string
  /** Signature block. `{firm}` takes a preposition in English and a postposition in hi/mr. */
  forFirm: string
  authorised: string
}

const EN: Phrases = {
  auctionTitle: 'Notice Before Sale by Public Auction',
  demandTitle: 'Notice of Demand',
  to: 'To',
  subject: 'Subject',
  noticeDate: 'Notice date',
  auctionSubject: 'Pledge No. {pledgeNo} — intention to sell the pledged ornaments by public auction',
  demandSubject: 'Outstanding dues of {total} — demand for payment',
  auctionRecital:
    'You pledged the ornaments described below with us on **{pledgeDate}** against Pledge No. **{pledgeNo}** and received an advance of **{principal}** at **{roi}**. The loan fell due for repayment on **{dueDate}** and remains unredeemed.',
  auctionRecitalNoDue:
    'You pledged the ornaments described below with us on **{pledgeDate}** against Pledge No. **{pledgeNo}** and received an advance of **{principal}** at **{roi}**. The loan remains unredeemed.',
  auctionPosition:
    'As at **{asOf}** the amount payable is **{total}** ({totalWords}), being principal {principalDue} and interest {interestDue} for {months}.',
  auctionOperative:
    'You are hereby called upon to redeem the pledge by paying the above sum, together with interest accruing to the date of payment, **on or before {deadline}** ({days} days from the date of this notice). Failing payment, the ornaments will be sold by public auction in accordance with the applicable State Pawn Brokers Act and Rules, and any surplus after recovery of the amount due and the expenses of sale will be held to your account.',
  demandRecital:
    'Our books show a sum of **{total}** ({totalWords}) outstanding against you. The particulars are set out below.',
  demandOperative:
    'You are requested to settle this amount **on or before {deadline}** ({days} days from the date of this notice). Kindly ignore this notice if payment has already been made.',
  scheduleTitle: 'Schedule of ornaments pledged',
  colSr: 'Sr',
  colArticle: 'Article pledged',
  colPurity: 'Purity',
  colGross: 'Gross Wt',
  colNet: 'Net Wt',
  noArticles: 'No articles recorded against this pledge.',
  bookedOn: 'Booked on',
  dueOn: 'Fell due on',
  particulars: 'Particulars',
  amountBooked: 'Amount booked',
  received: 'Received so far',
  balance: 'Balance payable',
  forFirm: 'For {firm}',
  authorised: 'Authorised Signatory',
}

const HI: Phrases = {
  auctionTitle: 'नीलामी पूर्व सूचना',
  demandTitle: 'भुगतान की सूचना',
  to: 'सेवा में',
  subject: 'विषय',
  noticeDate: 'सूचना दिनांक',
  auctionSubject: 'गिरवी क्रमांक {pledgeNo} — गिरवी आभूषणों को सार्वजनिक नीलामी द्वारा बेचने की सूचना',
  demandSubject: '{total} की बकाया राशि — भुगतान की मांग',
  auctionRecital:
    'आपने नीचे वर्णित आभूषण दिनांक **{pledgeDate}** को हमारे पास गिरवी रखकर, गिरवी क्रमांक **{pledgeNo}** के अंतर्गत **{principal}** की राशि **{roi}** की दर पर प्राप्त की थी। यह ऋण दिनांक **{dueDate}** को देय हो चुका है और अब तक नहीं चुकाया गया है।',
  auctionRecitalNoDue:
    'आपने नीचे वर्णित आभूषण दिनांक **{pledgeDate}** को हमारे पास गिरवी रखकर, गिरवी क्रमांक **{pledgeNo}** के अंतर्गत **{principal}** की राशि **{roi}** की दर पर प्राप्त की थी। यह ऋण अब तक नहीं चुकाया गया है।',
  auctionPosition:
    'दिनांक **{asOf}** को देय राशि **{total}** ({totalWords}) है, जिसमें मूलधन {principalDue} तथा {months} की अवधि का ब्याज {interestDue} सम्मिलित है।',
  auctionOperative:
    'आपसे अनुरोध है कि उपरोक्त राशि, भुगतान की तिथि तक के ब्याज सहित, **{deadline} तक** (इस सूचना की तिथि से {days} दिन के भीतर) जमा कर अपने आभूषण छुड़ा लें। भुगतान न करने पर आभूषण लागू राज्य साहूकार अधिनियम एवं नियमों के अनुसार सार्वजनिक नीलामी द्वारा बेच दिए जाएंगे, तथा देय राशि एवं विक्रय व्यय की वसूली के पश्चात शेष राशि आपके खाते में रखी जाएगी।',
  demandRecital:
    'हमारी बहियों के अनुसार आप पर **{total}** ({totalWords}) की राशि बकाया है। विवरण नीचे दिया गया है।',
  demandOperative:
    'कृपया उपरोक्त राशि **{deadline} तक** (इस सूचना की तिथि से {days} दिन के भीतर) जमा करें। यदि भुगतान हो चुका हो तो इस सूचना को अनदेखा करें।',
  scheduleTitle: 'गिरवी आभूषणों की सूची',
  colSr: 'क्र.',
  colArticle: 'गिरवी वस्तु',
  colPurity: 'शुद्धता',
  colGross: 'कुल वजन',
  colNet: 'शुद्ध वजन',
  noArticles: 'इस गिरवी पर कोई वस्तु दर्ज नहीं है।',
  bookedOn: 'दर्ज दिनांक',
  dueOn: 'देय दिनांक',
  particulars: 'विवरण',
  amountBooked: 'कुल राशि',
  received: 'प्राप्त राशि',
  balance: 'शेष देय',
  forFirm: '{firm} कृते',
  authorised: 'अधिकृत हस्ताक्षरकर्ता',
}

const MR: Phrases = {
  auctionTitle: 'जाहीर लिलावापूर्वीची नोटीस',
  demandTitle: 'रक्कम भरण्याची नोटीस',
  to: 'प्रति',
  subject: 'विषय',
  noticeDate: 'नोटीस दिनांक',
  auctionSubject: 'गहाण क्रमांक {pledgeNo} — गहाण दागिने जाहीर लिलावाने विकण्याबाबत नोटीस',
  demandSubject: '{total} ची थकीत रक्कम — भरणा करण्याची मागणी',
  auctionRecital:
    'आपण खाली नमूद केलेले दागिने दिनांक **{pledgeDate}** रोजी आमच्याकडे गहाण ठेवून, गहाण क्रमांक **{pledgeNo}** अन्वये **{principal}** इतकी रक्कम **{roi}** दराने घेतली होती. सदर कर्जाची मुदत दिनांक **{dueDate}** रोजी संपली असून ते अद्याप फेडलेले नाही.',
  auctionRecitalNoDue:
    'आपण खाली नमूद केलेले दागिने दिनांक **{pledgeDate}** रोजी आमच्याकडे गहाण ठेवून, गहाण क्रमांक **{pledgeNo}** अन्वये **{principal}** इतकी रक्कम **{roi}** दराने घेतली होती. सदर कर्ज अद्याप फेडलेले नाही.',
  auctionPosition:
    'दिनांक **{asOf}** रोजी देय रक्कम **{total}** ({totalWords}) इतकी आहे. यामध्ये मुद्दल {principalDue} व {months} या कालावधीचे व्याज {interestDue} समाविष्ट आहे.',
  auctionOperative:
    'आपणास कळविण्यात येते की, वरील रक्कम भरणा दिनांकापर्यंतच्या व्याजासह **{deadline} पर्यंत** (या नोटिशीच्या दिनांकापासून {days} दिवसांत) भरून आपले दागिने सोडवून घ्यावेत. रक्कम न भरल्यास सदर दागिने लागू असलेल्या राज्य सावकारी कायदा व नियमांनुसार जाहीर लिलावाने विकले जातील, आणि देय रक्कम व विक्री खर्च वसूल केल्यानंतर उरलेली रक्कम आपल्या खात्यावर जमा ठेवण्यात येईल.',
  demandRecital:
    'आमच्या हिशेबाप्रमाणे आपल्याकडे **{total}** ({totalWords}) इतकी रक्कम थकीत आहे. तपशील खाली दिला आहे.',
  demandOperative:
    'कृपया वरील रक्कम **{deadline} पर्यंत** (या नोटिशीच्या दिनांकापासून {days} दिवसांत) भरावी. भरणा झाला असल्यास ही नोटीस दुर्लक्षित करावी.',
  scheduleTitle: 'गहाण दागिन्यांची यादी',
  colSr: 'अ.क्र.',
  colArticle: 'गहाण वस्तू',
  colPurity: 'शुद्धता',
  colGross: 'एकूण वजन',
  colNet: 'निव्वळ वजन',
  noArticles: 'या गहाणावर कोणतीही वस्तू नोंदलेली नाही.',
  bookedOn: 'नोंद दिनांक',
  dueOn: 'देय दिनांक',
  particulars: 'तपशील',
  amountBooked: 'एकूण रक्कम',
  received: 'जमा रक्कम',
  balance: 'येणे बाकी',
  forFirm: '{firm} करिता',
  authorised: 'अधिकृत सहीदार',
}

export const NOTICE_PHRASES: Record<NoticeLang, Phrases> = { en: EN, hi: HI, mr: MR }

/** Substitutes {vars} into a phrase. An unknown placeholder is left alone rather than blanked. */
export function fill(template: string, vars: Partial<NoticeVars>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => {
    const v = vars[k as keyof NoticeVars]
    return v == null ? m : v
  })
}
