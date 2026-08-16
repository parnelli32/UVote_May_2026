#!/usr/bin/env node
// One-off backfill: sources official photos for PA House/Senate representatives
// from palegis.us (the PA General Assembly's own site) and Philadelphia City
// Council from a curated list of phlcouncil.com bio-page photo URLs, uploads
// each into the `representative-photos` Supabase Storage bucket, and sets
// representatives.photo_url.
//
// Membership only changes between legislative sessions, so this is run by
// hand when needed (like resolve-state-districts's mode=backfill) — it is not
// scheduled or invoked automatically.
//
// Requires production service-role credentials (not the browser-facing
// VITE_SUPABASE_ANON_KEY in .env — RLS on the representative-photos bucket
// and on representatives only allows admin-authenticated writes):
//   SUPABASE_URL=...
//   SUPABASE_SERVICE_ROLE_KEY=...
//   node scripts/backfill_rep_photos.mjs --dry-run   # report matches only, no writes
//   node scripts/backfill_rep_photos.mjs             # download + upload + update
//
// palegis.us member-card markup (live-verified 2026-08-15 against both
// palegis.us/house/members and palegis.us/senate/members):
//   <div class="... member mb-4" data-name="LAST First Middle" data-district="019" ...>
//     ...<img src="https://www.palegis.us/resources/images/members/200/{member_id}.jpg?...">
//   </div>
// data-name is "Last First[ Middle]" (last name first) and isn't reliably
// splittable on its own for multi-word first names ("Marc S. Anderson"), so
// matching against `representatives` uses the img's alt text / thumb-info-inner
// span instead, which is the member's plain "First [Middle] Last" display name.

import { createClient } from '@supabase/supabase-js';

const DRY_RUN = process.argv.includes('--dry-run');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (service-role, not the anon key).');
  process.exit(1);
}

// Same hardcoded body ids used in supabase/functions/legiscan-sync/index.ts.
const PA_HOUSE_BODY_ID = '3b6dee71-7cbd-41f1-95d0-3f997cf035be';
const PA_SENATE_BODY_ID = '474bb689-6767-4a56-8429-c09c20bc715c';
// Same constant as src/data/legislativeGuides.ts.
const PHILLY_COUNCIL_BODY_ID = 'a7792d73-3d93-4184-b5a9-600fc363caab';

const CHAMBERS = [
  { bodyId: PA_HOUSE_BODY_ID, label: 'PA House', url: 'https://www.palegis.us/house/members' },
  { bodyId: PA_SENATE_BODY_ID, label: 'PA Senate', url: 'https://www.palegis.us/senate/members' },
];

// Curated one-per-member photo URLs, hand-picked from each Council member's
// own phlcouncil.com bio page (no bulk feed exists for Council, and most bio
// pages only have a rotating gallery of press/event photos rather than a
// dedicated headshot — see the PR description for the sourcing notes and the
// fair-use rationale tracked in the open uvote-legiscan-tos-followup backlog
// item). Every current member's page was checked live 2026-08-15; 10 of 17
// had a clear solo, camera-facing shot on their bio page and are listed here.
// The other 7 only had group/event photos as their best available image —
// left commented out below for a human to pick a specific frame during PR
// review rather than force a low-quality match.
const COUNCIL_PHOTOS = [
  { firstName: 'Mark', lastName: 'Squilla', url: 'https://phlcouncil.com/wp-content/uploads/2020/02/8P6A3511.jpg' },
  { firstName: 'Michael', lastName: 'Driscoll', url: 'https://phlcouncil.com/wp-content/uploads/2022/06/134-scaled.jpg' },
  { firstName: 'Jim', lastName: 'Harrity', url: 'https://phlcouncil.com/wp-content/uploads/2022/12/20221201-8P6A0379-scaled.jpg' },
  { firstName: 'Cindy', lastName: 'Bass', url: 'https://phlcouncil.com/wp-content/uploads/2019/08/SS015626.jpg' },
  { firstName: 'Katherine', lastName: 'Gilmore Richardson', url: 'https://phlcouncil.com/wp-content/uploads/2025/02/Katherine-Gilmore-Richardson-blue-suit-in-council-session.jpg' },
  { firstName: 'Isaiah', lastName: 'Thomas', url: 'https://phlcouncil.com/wp-content/uploads/2025/02/53455428361_6f5d9e1e16_c.jpg' },
  { firstName: 'Kendra', lastName: 'Brooks', url: 'https://phlcouncil.com/wp-content/uploads/2024/09/KB-looking-back.jpg' },
  { firstName: 'Jamie', lastName: 'Gauthier', url: 'https://phlcouncil.com/wp-content/uploads/2022/12/IMG_5508-scaled.jpg' },
  { firstName: 'Nina', lastName: 'Ahmad', url: 'https://phlcouncil.com/wp-content/uploads/2024/05/53572409834_9b58e4c8fd_c.jpg' },
  { firstName: 'Nicolas', lastName: "O'Rourke", url: 'https://phlcouncil.com/wp-content/uploads/2024/05/53487983614_746fb22242_c.jpg' },
  // TODO (needs a human to pick one frame — bio page only had group/event photos):
  // Kenyatta Johnson (phlcouncil.com/kenyattajohnson), Curtis J. Jones Jr.
  // (phlcouncil.com/curtisjonesjr), Jeffery Young Jr.
  // (phlcouncil.com/jefferyyoungjr), Quetcy Lozada
  // (phlcouncil.com/quetcylozada), Anthony Phillips
  // (phlcouncil.com/anthonyphillips), Brian J. O'Neill
  // (phlcouncil.com/brianoneill), Rue Landau (phlcouncil.com/ruelandau).
];

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const MEMBER_CARD_RE = /<div class="[^"]*\bmember\b[^"]*"[^>]*data-name="([^"]*)"[^>]*data-district="([^"]*)"[\s\S]*?<img src="(https:\/\/www\.palegis\.us\/resources\/images\/members\/200\/(\d+)\.jpg[^"]*)"[^>]*alt="Photo of (?:Representative|Senator) ([^"]+)"/g;

async function fetchChamberMembers(chamber) {
  const res = await fetch(chamber.url, { headers: { 'User-Agent': 'Mozilla/5.0 (UVote civic-tech photo backfill; contact via uvotephilly.com)' } });
  if (!res.ok) throw new Error(`Failed to fetch ${chamber.url}: HTTP ${res.status}`);
  const html = await res.text();

  const members = [];
  for (const match of html.matchAll(MEMBER_CARD_RE)) {
    const [, , district, photoUrl, memberId, displayName] = match;
    members.push({
      bodyId: chamber.bodyId,
      chamberLabel: chamber.label,
      district: district.trim(),
      memberId,
      photoUrl: photoUrl.split('?')[0],
      displayName: displayName.trim(),
    });
  }
  return members;
}

// Two-tier case-insensitive match against a scraped "First [Middle] Last"
// display name: exact `first_name + ' ' + last_name` concat first (mirrors
// the sponsor-matching pattern in
// 20260528231330_add_primary_sponsor_id_and_bill_sponsors.sql), falling back
// to first-token/last-token comparison so a stored "Marc"/"Anderson" still
// matches a scraped "Marc S. Anderson".
function matchesRep(rep, displayName) {
  const norm = (s) => s.trim().toLowerCase();
  const scraped = norm(displayName);
  const exact = norm(`${rep.first_name} ${rep.last_name}`);
  if (scraped === exact) return true;

  const scrapedTokens = scraped.split(/\s+/);
  const first = norm(rep.first_name);
  const last = norm(rep.last_name);
  return scrapedTokens[0] === first && scrapedTokens[scrapedTokens.length - 1] === last;
}

async function uploadPhoto(sourceUrl, storagePath) {
  const res = await fetch(sourceUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (UVote civic-tech photo backfill; contact via uvotephilly.com)' } });
  if (!res.ok) throw new Error(`Failed to download ${sourceUrl}: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from('representative-photos')
    .upload(storagePath, bytes, { contentType: 'image/jpeg', upsert: true });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('representative-photos').getPublicUrl(storagePath);
  return data.publicUrl;
}

async function run() {
  const { data: reps, error: repsError } = await supabase
    .from('representatives')
    .select('representative_id, first_name, last_name, legislative_body_id')
    .in('legislative_body_id', [PA_HOUSE_BODY_ID, PA_SENATE_BODY_ID]);
  if (repsError) throw repsError;

  const unmatchedScraped = [];
  const unmatchedReps = new Set(reps.map((r) => r.representative_id));
  let updated = 0;

  for (const chamber of CHAMBERS) {
    const scrapedMembers = await fetchChamberMembers(chamber);
    console.log(`${chamber.label}: found ${scrapedMembers.length} member cards`);

    for (const scraped of scrapedMembers) {
      const rep = reps.find((r) => r.legislative_body_id === chamber.bodyId && matchesRep(r, scraped.displayName));
      if (!rep) {
        unmatchedScraped.push(`${chamber.label}: "${scraped.displayName}" (district ${scraped.district}, palegis member_id ${scraped.memberId})`);
        continue;
      }
      unmatchedReps.delete(rep.representative_id);

      if (DRY_RUN) {
        console.log(`  MATCH  ${rep.first_name} ${rep.last_name} <- ${scraped.displayName} (${scraped.photoUrl})`);
        continue;
      }

      const ext = scraped.photoUrl.split('.').pop();
      const storagePath = `pa/${rep.representative_id}.${ext}`;
      const publicUrl = await uploadPhoto(scraped.photoUrl, storagePath);

      const { error: updateError } = await supabase
        .from('representatives')
        .update({ photo_url: publicUrl })
        .eq('representative_id', rep.representative_id);
      if (updateError) throw updateError;

      updated++;
      console.log(`  OK  ${rep.first_name} ${rep.last_name} -> ${publicUrl}`);
    }
  }

  for (const entry of COUNCIL_PHOTOS) {
    const rep = await findCouncilRep(entry.firstName, entry.lastName);
    if (!rep) {
      unmatchedScraped.push(`Philadelphia City Council: "${entry.firstName} ${entry.lastName}" (curated entry, no matching representatives row)`);
      continue;
    }
    unmatchedReps.delete(rep.representative_id);

    if (DRY_RUN) {
      console.log(`  MATCH  ${rep.first_name} ${rep.last_name} <- curated Council photo (${entry.url})`);
      continue;
    }

    const ext = entry.url.split('?')[0].split('.').pop();
    const storagePath = `council/${rep.representative_id}.${ext}`;
    const publicUrl = await uploadPhoto(entry.url, storagePath);

    const { error: updateError } = await supabase
      .from('representatives')
      .update({ photo_url: publicUrl })
      .eq('representative_id', rep.representative_id);
    if (updateError) throw updateError;

    updated++;
    console.log(`  OK  ${rep.first_name} ${rep.last_name} -> ${publicUrl}`);
  }

  console.log(`\n${DRY_RUN ? 'Would update' : 'Updated'} ${DRY_RUN ? '(dry run)' : updated} representatives.`);

  if (unmatchedScraped.length > 0) {
    console.log(`\n${unmatchedScraped.length} scraped member(s) with no matching representatives row:`);
    unmatchedScraped.forEach((line) => console.log(`  - ${line}`));
  }

  const stillUnmatched = reps.filter((r) => unmatchedReps.has(r.representative_id));
  if (stillUnmatched.length > 0) {
    console.log(`\n${stillUnmatched.length} representatives row(s) with no scraped photo match:`);
    stillUnmatched.forEach((r) => console.log(`  - ${r.first_name} ${r.last_name} (${r.representative_id})`));
  }
}

async function findCouncilRep(firstName, lastName) {
  const { data, error } = await supabase
    .from('representatives')
    .select('representative_id, first_name, last_name')
    .eq('legislative_body_id', PHILLY_COUNCIL_BODY_ID)
    .ilike('first_name', firstName)
    .ilike('last_name', lastName)
    .maybeSingle();
  if (error) throw error;
  return data;
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
