import { beforeEach, describe, expect, it, jest } from '@jest/globals';
jest.mock('./crawler', () => {
  const fetchRobots = jest.fn();
  const checkSoft404 = jest.fn();
  const probeSitemap = jest.fn();
  const analyzeSitemap = jest.fn();
  const extractSitemapUrls = jest.fn();
  const extractSitemapHintsFromHtml = jest.fn().mockReturnValue([]);
  const existsUrl = jest.fn();
  return {
    fetchRobots,
    checkSoft404,
    probeSitemap,
    analyzeSitemap,
    extractSitemapUrls,
    extractSitemapHintsFromHtml,
    existsUrl,
  };
});

import { IssueCode } from '@seotracker/shared-types';
import * as cheerio from 'cheerio';

import {
  analyzeSitemap,
  checkSoft404,
  existsUrl,
  extractSitemapHintsFromHtml,
  extractSitemapUrls,
  fetchRobots,
  probeSitemap,
} from './crawler';
import { discoverSiteMetadata } from './sitemap-discovery';

const fetchRobotsMock = jest.mocked(fetchRobots);
const checkSoft404Mock = jest.mocked(checkSoft404);
const probeSitemapMock = jest.mocked(probeSitemap);
const analyzeSitemapMock = jest.mocked(analyzeSitemap);
const extractSitemapUrlsMock = jest.mocked(extractSitemapUrls);
const extractHintsMock = jest.mocked(extractSitemapHintsFromHtml);
const existsUrlMock = jest.mocked(existsUrl);

const fakePage = (url: string) => ({ url, statusCode: 200 }) as never;

describe('discoverSiteMetadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    extractHintsMock.mockReturnValue([]);
  });

  function defaultRobots(overrides = {}) {
    return {
      page: fakePage('https://x.test/robots.txt'),
      exists: true,
      disallowsAll: false,
      blockedAiBots: [],
      sitemaps: [],
      ...overrides,
    };
  }

  it('emits MISSING_FAVICON when probe says not exists and HTML had no <link rel=icon>', async () => {
    existsUrlMock.mockResolvedValueOnce({ page: fakePage('fav'), exists: false, statusCode: 404 });
    fetchRobotsMock.mockResolvedValueOnce(defaultRobots());
    checkSoft404Mock.mockResolvedValueOnce({ page: null, isSoft404: false, probedUrl: '' });
    probeSitemapMock.mockResolvedValue({ page: fakePage('s'), isSitemap: false });

    const $ = cheerio.load('<html></html>');
    const result = await discoverSiteMetadata({
      homepageUrl: 'https://x.test',
      $,
      hasFaviconLink: false,
      timeoutMs: 1000,
      userAgent: 'ua',
      sitemapSampleMax: 100,
    });

    expect(result.issues.find((i) => i.issueCode === IssueCode.MISSING_FAVICON)).toBeDefined();
  });

  it('does NOT probe favicon when HTML has <link rel=icon>', async () => {
    fetchRobotsMock.mockResolvedValueOnce(defaultRobots());
    checkSoft404Mock.mockResolvedValueOnce({ page: null, isSoft404: false, probedUrl: '' });
    probeSitemapMock.mockResolvedValue({ page: fakePage('s'), isSitemap: false });

    await discoverSiteMetadata({
      homepageUrl: 'https://x.test',
      $: cheerio.load(''),
      hasFaviconLink: true,
      timeoutMs: 1000,
      userAgent: 'ua',
      sitemapSampleMax: 100,
    });

    expect(existsUrlMock).not.toHaveBeenCalled();
  });

  it('emits MISSING_ROBOTS when robots.txt does not exist', async () => {
    fetchRobotsMock.mockResolvedValueOnce(defaultRobots({ exists: false }));
    checkSoft404Mock.mockResolvedValueOnce({ page: null, isSoft404: false, probedUrl: '' });
    probeSitemapMock.mockResolvedValue({ page: fakePage('s'), isSitemap: false });

    const result = await discoverSiteMetadata({
      homepageUrl: 'https://x.test',
      $: cheerio.load(''),
      hasFaviconLink: true,
      timeoutMs: 1000,
      userAgent: 'ua',
      sitemapSampleMax: 100,
    });

    expect(result.issues.find((i) => i.issueCode === IssueCode.MISSING_ROBOTS)).toBeDefined();
  });

  it('emits ROBOTS_DISALLOWS_ALL with CRITICAL severity', async () => {
    fetchRobotsMock.mockResolvedValueOnce(defaultRobots({ disallowsAll: true }));
    checkSoft404Mock.mockResolvedValueOnce({ page: null, isSoft404: false, probedUrl: '' });
    probeSitemapMock.mockResolvedValue({ page: fakePage('s'), isSitemap: false });

    const result = await discoverSiteMetadata({
      homepageUrl: 'https://x.test',
      $: cheerio.load(''),
      hasFaviconLink: true,
      timeoutMs: 1000,
      userAgent: 'ua',
      sitemapSampleMax: 100,
    });

    expect(result.issues.find((i) => i.issueCode === IssueCode.ROBOTS_DISALLOWS_ALL)).toBeDefined();
  });

  it('emits AI_CRAWLERS_BLOCKED metric and issue', async () => {
    fetchRobotsMock.mockResolvedValueOnce(defaultRobots({ blockedAiBots: ['GPTBot', 'CCBot'] }));
    checkSoft404Mock.mockResolvedValueOnce({ page: null, isSoft404: false, probedUrl: '' });
    probeSitemapMock.mockResolvedValue({ page: fakePage('s'), isSitemap: false });

    const result = await discoverSiteMetadata({
      homepageUrl: 'https://x.test',
      $: cheerio.load(''),
      hasFaviconLink: true,
      timeoutMs: 1000,
      userAgent: 'ua',
      sitemapSampleMax: 100,
    });

    expect(result.metrics).toContainEqual({ key: 'ai_crawlers_blocked', valueNum: 2 });
    expect(result.issues.find((i) => i.issueCode === IssueCode.AI_CRAWLERS_BLOCKED)).toBeDefined();
  });

  it('emits SOFT_404 issue when soft-404 detected', async () => {
    fetchRobotsMock.mockResolvedValueOnce(defaultRobots());
    checkSoft404Mock.mockResolvedValueOnce({
      page: fakePage('soft'),
      isSoft404: true,
      probedUrl: 'https://x.test/__not_real__',
    });
    probeSitemapMock.mockResolvedValue({ page: fakePage('s'), isSitemap: false });

    const result = await discoverSiteMetadata({
      homepageUrl: 'https://x.test',
      $: cheerio.load(''),
      hasFaviconLink: true,
      timeoutMs: 1000,
      userAgent: 'ua',
      sitemapSampleMax: 100,
    });

    expect(result.issues.find((i) => i.issueCode === IssueCode.SOFT_404)).toBeDefined();
    expect(result.pages.find((page) => page.url === 'soft')).toBeUndefined();
  });

  it('does not expose successful 404 probes as analyzed pages', async () => {
    fetchRobotsMock.mockResolvedValueOnce(defaultRobots());
    checkSoft404Mock.mockResolvedValueOnce({
      page: fakePage('https://x.test/__seotracker_nonexistent_123__'),
      isSoft404: false,
      probedUrl: 'https://x.test/__seotracker_nonexistent_123__',
    });
    probeSitemapMock.mockResolvedValue({ page: fakePage('s'), isSitemap: false });

    const result = await discoverSiteMetadata({
      homepageUrl: 'https://x.test',
      $: cheerio.load(''),
      hasFaviconLink: true,
      timeoutMs: 1000,
      userAgent: 'ua',
      sitemapSampleMax: 100,
    });

    expect(result.issues.find((i) => i.issueCode === IssueCode.SOFT_404)).toBeUndefined();
    expect(result.pages.map((page) => page.url)).not.toContain(
      'https://x.test/__seotracker_nonexistent_123__',
    );
  });

  it('finds sitemap, extracts urls, emits sitemap_urls metric', async () => {
    fetchRobotsMock.mockResolvedValueOnce(
      defaultRobots({ sitemaps: ['https://x.test/sitemap.xml'] }),
    );
    checkSoft404Mock.mockResolvedValueOnce({ page: null, isSoft404: false, probedUrl: '' });
    probeSitemapMock.mockResolvedValueOnce({ page: fakePage('sm'), isSitemap: true });
    analyzeSitemapMock.mockResolvedValueOnce({ urlCount: 42, invalid: false });
    extractSitemapUrlsMock.mockResolvedValueOnce(['https://x.test/a', 'https://x.test/b']);

    const result = await discoverSiteMetadata({
      homepageUrl: 'https://x.test',
      $: cheerio.load(''),
      hasFaviconLink: true,
      timeoutMs: 1000,
      userAgent: 'ua',
      sitemapSampleMax: 100,
    });

    expect(result.metrics).toContainEqual({ key: 'sitemap_urls', valueNum: 42 });
    expect(result.sitemapUrls).toStrictEqual(['https://x.test/a', 'https://x.test/b']);
  });

  it('emits MISSING_SITEMAP when no candidate is a sitemap', async () => {
    fetchRobotsMock.mockResolvedValueOnce(defaultRobots());
    checkSoft404Mock.mockResolvedValueOnce({ page: null, isSoft404: false, probedUrl: '' });
    probeSitemapMock.mockResolvedValue({ page: fakePage('s'), isSitemap: false });

    const result = await discoverSiteMetadata({
      homepageUrl: 'https://x.test',
      $: cheerio.load(''),
      hasFaviconLink: true,
      timeoutMs: 1000,
      userAgent: 'ua',
      sitemapSampleMax: 100,
    });

    expect(result.issues.find((i) => i.issueCode === IssueCode.MISSING_SITEMAP)).toBeDefined();
    expect(result.sitemapUrls).toStrictEqual([]);
  });

  it('emits SITEMAP_INVALID when sitemap analysis says invalid', async () => {
    fetchRobotsMock.mockResolvedValueOnce(defaultRobots());
    checkSoft404Mock.mockResolvedValueOnce({ page: null, isSoft404: false, probedUrl: '' });
    probeSitemapMock.mockResolvedValueOnce({ page: fakePage('sm'), isSitemap: true });
    analyzeSitemapMock.mockResolvedValueOnce({ urlCount: null, invalid: true });

    const result = await discoverSiteMetadata({
      homepageUrl: 'https://x.test',
      $: cheerio.load(''),
      hasFaviconLink: true,
      timeoutMs: 1000,
      userAgent: 'ua',
      sitemapSampleMax: 100,
    });

    expect(result.issues.find((i) => i.issueCode === IssueCode.SITEMAP_INVALID)).toBeDefined();
  });

  it('emits SITEMAP_EMPTY when urlCount is 0', async () => {
    fetchRobotsMock.mockResolvedValueOnce(defaultRobots());
    checkSoft404Mock.mockResolvedValueOnce({ page: null, isSoft404: false, probedUrl: '' });
    probeSitemapMock.mockResolvedValueOnce({ page: fakePage('sm'), isSitemap: true });
    analyzeSitemapMock.mockResolvedValueOnce({ urlCount: 0, invalid: false });

    const result = await discoverSiteMetadata({
      homepageUrl: 'https://x.test',
      $: cheerio.load(''),
      hasFaviconLink: true,
      timeoutMs: 1000,
      userAgent: 'ua',
      sitemapSampleMax: 100,
    });

    expect(result.issues.find((i) => i.issueCode === IssueCode.SITEMAP_EMPTY)).toBeDefined();
  });
});
