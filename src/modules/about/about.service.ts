// src/modules/about/about.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AboutPayload } from './types';
import type { Value, TeamMember, Stat, TimelineItem, FAQ } from '@prisma/client';
@Injectable()
export class AboutService {
  constructor(private prisma: PrismaService) {}

 async getAbout() {
    const about = await this.prisma.aboutPage.findUnique({
      where: { slug: 'about' },
      include: {
        values: { orderBy: { order: 'asc' } },
        team: { orderBy: { order: 'asc' } },
        stats: { orderBy: { order: 'asc' } },
        timeline: { orderBy: { order: 'asc' } },
        faqs: { orderBy: { order: 'asc' } },
      },
    });
    if (!about) return null;

    // Return FLAT shape expected by frontend editors
    return {
      slug: about.slug,
      heroEyebrow: about.heroEyebrow,
      heroTitle: about.heroTitle,
      heroDesc: about.heroDesc,
      heroImage: about.heroImage,
      missionTitle: about.missionTitle,
      missionParagraphs: about.missionParagraphs ?? [],
      values: (about.values ?? []).map((v: Value) => ({
        id: v.id,
        title: v.title,
        desc: v.desc,
        order: v.order,
        icon: v.icon,
      })),
      team: (about.team ?? []).map((t: TeamMember) => ({
        id: t.id,
        name: t.name,
        role: t.role,
        bio: t.bio,
        photo: t.photo,
        social: t.social,
        order: t.order,
      })),
      stats: (about.stats ?? []).map((s: Stat) => ({
        id: s.id,
        label: s.label,
        value: s.value,
        order: s.order,
      })),
      timeline: (about.timeline ?? []).map((ti: TimelineItem) => ({
        id: ti.id,
        year: ti.year,
        text: ti.text,
        order: ti.order,
      })),
      faqs: (about.faqs ?? []).map((f: FAQ) => ({
        id: f.id,
        q: f.q,
        a: f.a,
        order: f.order,
      })),
    } as AboutPayload;
  }

async updateAbout(payload: AboutPayload) {
  const {
    heroEyebrow = null,
    heroTitle = null,
    heroDesc = null,
    heroImage = null,
    missionTitle = null,
    missionParagraphs = [],
    values,
    team,
    stats,
    timeline,
    faqs,
  } = payload as any;

  // Upsert the main About record
  const about = await this.prisma.aboutPage.upsert({
    where: { slug: "about" },
    create: {
      slug: "about",
      heroEyebrow,
      heroTitle,
      heroDesc,
      heroImage,
      missionTitle,
      missionParagraphs,
    },
    update: {
      heroEyebrow: heroEyebrow ?? undefined,
      heroTitle: heroTitle ?? undefined,
      heroDesc: heroDesc ?? undefined,
      heroImage: heroImage ?? undefined,
      missionTitle: missionTitle ?? undefined,
      missionParagraphs: missionParagraphs ?? undefined,
    },
  });

  // ✅ Only replace child arrays if provided
  if (values) {
    await this.prisma.value.deleteMany({ where: { aboutId: about.id } });
    if (values.length) {
      await this.prisma.value.createMany({
        data: values.map((v: any, i: number) => ({
          aboutId: about.id,
          title: v.title,
          desc: v.desc,
          order: v.order ?? i,
          icon: v.icon,
        })),
      });
    }
  }

  if (team) {
    await this.prisma.teamMember.deleteMany({ where: { aboutId: about.id } });
    if (team.length) {
      await this.prisma.teamMember.createMany({
        data: team.map((m: any, i: number) => ({
          aboutId: about.id,
          name: m.name,
          role: m.role,
          bio: m.bio,
          photo: m.photo,
          social: m.social,
          order: m.order ?? i,
        })),
      });
    }
  }

  if (stats) {
    await this.prisma.stat.deleteMany({ where: { aboutId: about.id } });
    if (stats.length) {
      await this.prisma.stat.createMany({
        data: stats.map((s: any, i: number) => ({
          aboutId: about.id,
          label: s.label,
          value: s.value,
          order: s.order ?? i,
        })),
      });
    }
  }

  if (timeline) {
    await this.prisma.timelineItem.deleteMany({ where: { aboutId: about.id } });
    if (timeline.length) {
      await this.prisma.timelineItem.createMany({
        data: timeline.map((t: any, i: number) => ({
          aboutId: about.id,
          year: t.year,
          text: t.text,
          order: t.order ?? i,
        })),
      });
    }
  }

  if (faqs) {
    await this.prisma.fAQ.deleteMany({ where: { aboutId: about.id } });
    if (faqs.length) {
      await this.prisma.fAQ.createMany({
        data: faqs.map((f: any, i: number) => ({
          aboutId: about.id,
          q: f.q,
          a: f.a,
          order: f.order ?? i,
        })),
      });
    }
  }

  // ✅ Return normalized current state
  return this.getAbout();
}

}
