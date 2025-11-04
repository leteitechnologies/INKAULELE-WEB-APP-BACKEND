// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const slug = 'about';

  // upsert AboutPage
  const about = await prisma.aboutPage.upsert({
    where: { slug },
    create: {
      slug,
      heroTitle: "We connect curious travellers with authentic Kenyan culture",
      heroEyebrow: "About us",
      heroDesc: "Locally-led tours, community experiences and sustainable journeys across Kenya. We design intimate, meaningful encounters — from coastal Swahili towns to Maasai-led village evenings.",
      heroImage: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1400&q=60",
      missionTitle: "Our mission",
      missionParagraphs: [
        "Build meaningful cultural exchange between visitors and hosts.",
        "Empower local communities by creating long-term income & training opportunities."
      ],
    },
    update: {
      heroTitle: "We connect curious travellers with authentic Kenyan culture",
      heroImage: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1400&q=60",
      missionTitle: "Our mission",
      missionParagraphs: [
        "Build meaningful cultural exchange between visitors and hosts.",
        "Empower local communities by creating long-term income & training opportunities."
      ],
    },
  });

  // values
  const valuesData = [
    { title: "Respectful Travel", desc: "We work with communities to design experiences that respect local customs." },
    { title: "Sustainable Impact", desc: "A portion of our revenue supports local education and conservation." },
    { title: "Verified Hosts", desc: "Every host is vetted and trained for guest safety and cultural authenticity." }
  ];

  await Promise.all(valuesData.map((v, i) =>
    prisma.value.upsert({
      where: { id: `${about.id}-v-${i}` }, // deterministic id for idempotent seed
      create: { id: `${about.id}-v-${i}`, aboutId: about.id, title: v.title, desc: v.desc, order: i },
      update: { title: v.title, desc: v.desc, order: i }
    })
  ));

  // team
  const teamData = [
    { name: "Amina Mwangi", role: "Founder & Director", bio: "Amina grew up in coastal Kenya and has 10+ years in responsible tourism.", photo: "https://randomuser.me/api/portraits/women/44.jpg" },
    { name: "Daniel O.", role: "Head of Experiences", bio: "Daniel curates local partnerships and trains our experience hosts.", photo: "https://randomuser.me/api/portraits/men/32.jpg" }
  ];
  await Promise.all(teamData.map((t, i) =>
    prisma.teamMember.upsert({
      where: { id: `${about.id}-tm-${i}` },
      create: { id: `${about.id}-tm-${i}`, aboutId: about.id, name: t.name, role: t.role, bio: t.bio, photo: t.photo, order: i },
      update: { name: t.name, role: t.role, bio: t.bio, photo: t.photo, order: i }
    })
  ));

  // stats, timeline, faqs (similar pattern)
  const stats = [
    { label: "Experiences hosted", value: 1240 },
    { label: "Local hosts", value: 320 },
    { label: "Countries of origin", value: 48 }
  ];
  await Promise.all(stats.map((s, i) =>
    prisma.stat.upsert({
      where: { id: `${about.id}-s-${i}` },
      create: { id: `${about.id}-s-${i}`, aboutId: about.id, label: s.label, value: s.value, order: i },
      update: { label: s.label, value: s.value, order: i }
    })
  ));

  const timeline = [
    { year: "2016", text: "Founded in Nairobi — first community pilot in Lamu." },
    { year: "2019", text: "Launched Maasai cultural exchange programme." },
    { year: "2021", text: "Expanded to include coastal eco-lodges and artisans." },
    { year: "2023", text: "Reached 1,000 experiences hosted — 300+ local guides onboard." }
  ];
  await Promise.all(timeline.map((t, i) =>
    prisma.timelineItem.upsert({
      where: { id: `${about.id}-y-${i}` },
      create: { id: `${about.id}-y-${i}`, aboutId: about.id, year: t.year, text: t.text, order: i },
      update: { year: t.year, text: t.text, order: i }
    })
  ));

  const faqs = [
    { q: "Are experiences suitable for children?", a: "Many are — check each experience. We can recommend family-friendly options." },
    { q: "Do you support sustainable tourism?", a: "Yes. We donate a percentage of each booking to local projects." }
  ];
  await Promise.all(faqs.map((f, i) =>
    prisma.fAQ.upsert({
      where: { id: `${about.id}-f-${i}` },
      create: { id: `${about.id}-f-${i}`, aboutId: about.id, q: f.q, a: f.a, order: i },
      update: { q: f.q, a: f.a, order: i }
    })
  ));

  console.log('About seed complete');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => process.exit());
