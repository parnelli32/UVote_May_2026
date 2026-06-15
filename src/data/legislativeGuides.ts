export const PHILLY_COUNCIL_BODY_ID =
  'a7792d73-3d93-4184-b5a9-600fc363caab';

export type StageImpact =
  'high' | 'medium' | 'low';

export type GuideStage = {
  number: number;
  title: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  description: string;
  impactLevel: StageImpact;
  impactLabel: string;
  impactColor: string;
  badgeLabel?: string;
  badgeBg?: string;
  badgeColor?: string;
  uvoteMessage?: string;
  actionPhrase: string;
};

export type LegislativeBodyGuide = {
  bodyId: string;
  bodyName: string;
  stages: GuideStage[];
};

export const LEGISLATIVE_GUIDES:
  Record<string, LegislativeBodyGuide> = {
  [PHILLY_COUNCIL_BODY_ID]: {
    bodyId: PHILLY_COUNCIL_BODY_ID,
    bodyName: 'Philadelphia City Council',
    stages: [
      {
        number: 1,
        title: 'Bill introduction',
        icon: 'fa-solid fa-file-lines',
        iconBg: '#F1F5F9',
        iconColor: '#475569',
        description:
          'A council member introduces a ' +
          'bill at a Stated Meeting and ' +
          'hands it to the Chief Clerk. ' +
          'The Clerk reads the title aloud ' +
          'and assigns a 6-digit tracking ' +
          'number. The Council President ' +
          'then refers it to a committee.',
        impactLevel: 'medium',
        impactLabel: 'Medium',
        impactColor: '#F5A623',
        uvoteMessage:
          'Bills appear in UVote the moment ' +
          'they are introduced. Vote early ' +
          'to help establish your district\'s ' +
          'position before the committee ' +
          'hearing.',
        actionPhrase: 'Get on record early',
      },
      {
        number: 2,
        title: 'Committee hearing',
        icon: 'fa-solid fa-people-group',
        iconBg: '#FFF3D6',
        iconColor: '#7A4F00',
        description:
          'The committee chair schedules ' +
          'a public hearing. Citizens can ' +
          'testify in person at City Hall. ' +
          'Committee members debate, propose ' +
          'amendments, and vote whether to ' +
          'advance the bill. The bill can ' +
          'still be changed at this stage.',
        impactLevel: 'high',
        impactLabel: 'High — act now',
        impactColor: '#F5A623',
        badgeLabel: 'Highest impact',
        badgeBg: '#F5A623',
        badgeColor: '#412402',
        uvoteMessage:
          'This is the highest-impact window. ' +
          'The bill is still being shaped. ' +
          'Your district\'s UVote position is ' +
          'the kind of constituent data that ' +
          'influences a committee member ' +
          'before the hearing.',
        actionPhrase: 'Bills get shaped in committee — your voice carries the most weight here',
      },
      {
        number: 3,
        title: 'First reading',
        icon: 'fa-solid fa-book',
        iconBg: '#F1F5F9',
        iconColor: '#475569',
        description:
          'The bill title is read aloud at ' +
          'a Stated Meeting. This starts a ' +
          'mandatory waiting period — a bill ' +
          'cannot be voted on at the same ' +
          'meeting it receives its first ' +
          'reading. A vote is at least one ' +
          'week away.',
        impactLevel: 'low',
        impactLabel: 'Low — procedural',
        impactColor: '#94a3b8',
        actionPhrase: 'Bill cleared committee — still time to get on record',
      },
      {
        number: 4,
        title: 'Public comment',
        icon: 'fa-solid fa-microphone',
        iconBg: '#E8F0EB',
        iconColor: '#1B4332',
        description:
          'Citizens get 3 minutes to speak ' +
          'on bills coming to a final vote. ' +
          'You must sign up the same day at ' +
          'City Hall. At this stage, it is ' +
          'rare for a rep to change their ' +
          'vote based on public input.',
        impactLevel: 'medium',
        impactLabel: 'Medium',
        impactColor: '#F5A623',
        badgeLabel: 'UVote advantage',
        badgeBg: '#E8F0EB',
        badgeColor: '#1B4332',
        uvoteMessage:
          'A 3-minute comment disappears. ' +
          'Your UVote statement is permanent ' +
          'digital testimony, visible to your ' +
          'rep any time they check. You\'ve ' +
          'been on record since the bill was ' +
          'introduced.',
        actionPhrase: 'Council vote is imminent — get your position on record now',
      },
      {
        number: 5,
        title: 'Final vote',
        icon: 'fa-solid fa-check-to-slot',
        iconBg: '#E8F0EB',
        iconColor: '#1B4332',
        description:
          'Council members cast their votes ' +
          'on second reading. A simple ' +
          'majority — 9 of 17 members — ' +
          'passes most bills. Charter ' +
          'amendments and new debt require ' +
          'a two-thirds majority (12 of 17).',
        impactLevel: 'high',
        impactLabel: 'Accountability',
        impactColor: '#1B4332',
        badgeLabel: 'Accountability moment',
        badgeBg: '#E8F0EB',
        badgeColor: '#1B4332',
        uvoteMessage:
          'The moment your rep votes, their ' +
          'alignment score updates. If they ' +
          'voted against your district\'s ' +
          'majority, UVote flags it and they ' +
          'have to explain why publicly.',
        actionPhrase: 'Did your rep vote with your district?',
      },
      {
        number: 6,
        title: 'Mayor\'s desk',
        icon: 'fa-solid fa-pen-to-square',
        iconBg: '#FFF3D6',
        iconColor: '#7A4F00',
        description:
          'After Council passes a bill, the ' +
          'Mayor has three options: sign it ' +
          'into law, let it become law without ' +
          'signing after 10 days, or veto it. ' +
          'Council can override a veto with a ' +
          '12-of-17 supermajority. Vetoes are ' +
          'rare — most bills pass 17-0.',
        impactLevel: 'low',
        impactLabel: 'Low — process concludes',
        impactColor: '#94a3b8',
        actionPhrase: 'Last stop before it becomes law',
      },
    ],
  },
};
