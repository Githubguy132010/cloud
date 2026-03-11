import { createCallerForUser } from '@/routers/test-utils';
import { db } from '@/lib/drizzle';
import { kilocode_users } from '@kilocode/db/schema';
import { eq } from 'drizzle-orm';
import { insertTestUser } from '@/tests/helpers/user.helper';
import type { User } from '@kilocode/db/schema';

let testUser: User;
let surveyTestUser: User;

describe('user router - updateProfile', () => {
  beforeAll(async () => {
    testUser = await insertTestUser({
      google_user_email: 'update-profile-test@example.com',
      google_user_name: 'Profile Test User',
    });
  });

  afterEach(async () => {
    // Reset profile URLs between tests
    await db
      .update(kilocode_users)
      .set({ linkedin_url: null, github_url: null })
      .where(eq(kilocode_users.id, testUser.id));
  });

  it('updates linkedin_url only', async () => {
    const caller = await createCallerForUser(testUser.id);
    const result = await caller.user.updateProfile({
      linkedin_url: 'https://linkedin.com/in/testuser',
    });

    expect(result).toEqual({ success: true });

    const updated = await db.query.kilocode_users.findFirst({
      where: eq(kilocode_users.id, testUser.id),
    });
    expect(updated?.linkedin_url).toBe('https://linkedin.com/in/testuser');
    expect(updated?.github_url).toBeNull();
  });

  it('updates github_url only', async () => {
    const caller = await createCallerForUser(testUser.id);
    const result = await caller.user.updateProfile({
      github_url: 'https://github.com/testuser',
    });

    expect(result).toEqual({ success: true });

    const updated = await db.query.kilocode_users.findFirst({
      where: eq(kilocode_users.id, testUser.id),
    });
    expect(updated?.github_url).toBe('https://github.com/testuser');
    expect(updated?.linkedin_url).toBeNull();
  });

  it('updates both fields at once', async () => {
    const caller = await createCallerForUser(testUser.id);
    const result = await caller.user.updateProfile({
      linkedin_url: 'https://linkedin.com/in/testuser',
      github_url: 'https://github.com/testuser',
    });

    expect(result).toEqual({ success: true });

    const updated = await db.query.kilocode_users.findFirst({
      where: eq(kilocode_users.id, testUser.id),
    });
    expect(updated?.linkedin_url).toBe('https://linkedin.com/in/testuser');
    expect(updated?.github_url).toBe('https://github.com/testuser');
  });

  it('clears a URL by passing null', async () => {
    // First set a value
    await db
      .update(kilocode_users)
      .set({ linkedin_url: 'https://linkedin.com/in/testuser' })
      .where(eq(kilocode_users.id, testUser.id));

    const caller = await createCallerForUser(testUser.id);
    const result = await caller.user.updateProfile({
      linkedin_url: null,
    });

    expect(result).toEqual({ success: true });

    const updated = await db.query.kilocode_users.findFirst({
      where: eq(kilocode_users.id, testUser.id),
    });
    expect(updated?.linkedin_url).toBeNull();
  });

  it('rejects invalid URLs', async () => {
    const caller = await createCallerForUser(testUser.id);

    await expect(
      caller.user.updateProfile({
        linkedin_url: 'not-a-url',
      })
    ).rejects.toThrow();

    await expect(
      caller.user.updateProfile({
        github_url: 'just some text',
      })
    ).rejects.toThrow();
  });

  it('rejects javascript: protocol URLs', async () => {
    const caller = await createCallerForUser(testUser.id);

    await expect(
      caller.user.updateProfile({
        linkedin_url: 'javascript:alert(1)',
      })
    ).rejects.toThrow();

    await expect(
      caller.user.updateProfile({
        github_url: 'javascript:void(0)',
      })
    ).rejects.toThrow();
  });

  it('returns success when no fields are provided', async () => {
    const caller = await createCallerForUser(testUser.id);
    const result = await caller.user.updateProfile({});

    expect(result).toEqual({ success: true });
  });
});

describe('user router - submitCustomerSource', () => {
  beforeAll(async () => {
    surveyTestUser = await insertTestUser({
      google_user_email: 'survey-test@example.com',
      google_user_name: 'Survey Test User',
    });
  });

  afterEach(async () => {
    await db
      .update(kilocode_users)
      .set({ customer_source: null })
      .where(eq(kilocode_users.id, surveyTestUser.id));
  });

  it('saves the customer source to the database', async () => {
    const caller = await createCallerForUser(surveyTestUser.id);
    const result = await caller.user.submitCustomerSource({ source: 'A YouTube video' });

    expect(result).toEqual({ success: true });

    const updated = await db.query.kilocode_users.findFirst({
      where: eq(kilocode_users.id, surveyTestUser.id),
    });
    expect(updated?.customer_source).toBe('A YouTube video');
  });

  it('overwrites a previous response', async () => {
    const caller = await createCallerForUser(surveyTestUser.id);

    await caller.user.submitCustomerSource({ source: 'First answer' });
    await caller.user.submitCustomerSource({ source: 'Updated answer' });

    const updated = await db.query.kilocode_users.findFirst({
      where: eq(kilocode_users.id, surveyTestUser.id),
    });
    expect(updated?.customer_source).toBe('Updated answer');
  });

  it('rejects empty strings', async () => {
    const caller = await createCallerForUser(surveyTestUser.id);

    await expect(caller.user.submitCustomerSource({ source: '' })).rejects.toThrow();
  });

  it('rejects strings over 1000 characters', async () => {
    const caller = await createCallerForUser(surveyTestUser.id);

    const longString = 'a'.repeat(1001);
    await expect(caller.user.submitCustomerSource({ source: longString })).rejects.toThrow();
  });

  it('accepts a string at the max length of 1000', async () => {
    const caller = await createCallerForUser(surveyTestUser.id);
    const maxString = 'a'.repeat(1000);

    const result = await caller.user.submitCustomerSource({ source: maxString });
    expect(result).toEqual({ success: true });

    const updated = await db.query.kilocode_users.findFirst({
      where: eq(kilocode_users.id, surveyTestUser.id),
    });
    expect(updated?.customer_source).toBe(maxString);
  });
});
