import { IssueCode, Severity } from '@seotracker/shared-types';
import type { load } from 'cheerio';

import {
  computeFleschScore,
  countWords,
  extractArticleMetadata,
  extractJsonLdTypes,
  isBlogLike,
} from './content-utils';
import { getIssueCategory } from './scoring';
import type { SeoIssue } from './seo-engine.types';

type Cheerio = ReturnType<typeof load>;

const STALE_CONTENT_DAYS = 730;
const SHORT_BLOG_POST_THRESHOLD = 600;
const POOR_READABILITY_THRESHOLD = 30;

/**
 * Run blog/article-specific quality checks (article schema, author, freshness,
 * post length, readability). Returns no issues for non-blog pages.
 */
export function runBlogChecks(pageUrl: string, $: Cheerio, text: string): SeoIssue[] {
  if (!isBlogLike(pageUrl, $)) {
    return [];
  }
  const results: SeoIssue[] = [];
  const jsonLdTypes = extractJsonLdTypes($);
  const hasArticleSchema = jsonLdTypes.some((t) => /article|blogposting|newsarticle/i.test(t));
  if (!hasArticleSchema) {
    results.push({
      category: getIssueCategory(IssueCode.MISSING_ARTICLE_SCHEMA),
      issueCode: IssueCode.MISSING_ARTICLE_SCHEMA,
      message: 'Blog-like page without Article/BlogPosting JSON-LD schema',
      resourceUrl: pageUrl,
      severity: Severity.LOW,
    });
  }

  const metadata = extractArticleMetadata($);
  if (!metadata.author) {
    results.push({
      category: getIssueCategory(IssueCode.MISSING_AUTHOR),
      issueCode: IssueCode.MISSING_AUTHOR,
      message: 'Article missing author information (E-E-A-T signal)',
      resourceUrl: pageUrl,
      severity: Severity.LOW,
    });
  }

  if (metadata.modifiedDate) {
    const ageDays = (Date.now() - metadata.modifiedDate.getTime()) / 86_400_000;
    if (ageDays > STALE_CONTENT_DAYS) {
      results.push({
        category: getIssueCategory(IssueCode.STALE_CONTENT),
        issueCode: IssueCode.STALE_CONTENT,
        message: `Content last modified ${Math.round(ageDays / 365)} years ago`,
        meta: { ageDays: Math.round(ageDays), modifiedAt: metadata.modifiedDate.toISOString() },
        resourceUrl: pageUrl,
        severity: Severity.LOW,
      });
    }
  }

  const wordCount = countWords(text);
  if (wordCount > 0 && wordCount < SHORT_BLOG_POST_THRESHOLD) {
    results.push({
      category: getIssueCategory(IssueCode.SHORT_BLOG_POST),
      issueCode: IssueCode.SHORT_BLOG_POST,
      message: `Short blog post (${wordCount} words, recommended ${SHORT_BLOG_POST_THRESHOLD}+)`,
      meta: { wordCount },
      resourceUrl: pageUrl,
      severity: Severity.LOW,
    });
  }

  const flesch = computeFleschScore(text);
  if (flesch !== undefined && flesch < POOR_READABILITY_THRESHOLD) {
    results.push({
      category: getIssueCategory(IssueCode.POOR_READABILITY),
      issueCode: IssueCode.POOR_READABILITY,
      message: `Low readability (Flesch score ${flesch}, recommended > 50)`,
      meta: { flesch },
      resourceUrl: pageUrl,
      severity: Severity.LOW,
    });
  }

  return results;
}
