// Public values (safe to ship to the browser). Environment variables override them.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wcixokepwifnarnrfdcn.supabase.co';
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjaXhva2Vwd2lmbmFybnJmZGNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ0MTUxMTYsImV4cCI6MjEwOTk5MTExNn0.scd39WtSMB9ucLB-isBQ01tFfdJNCkTfTZLdN4JKsBg';

export const PLANS = [
  { id: 'trial', name: 'Free trial', price: 0, period: '14 days', hours: 3, users: '1 user', blurb: 'Try every feature on your own meetings.', cta: 'Start free' },
  { id: 'starter', name: 'Starter', price: 39, period: 'per month', hours: 10, users: '1 user', blurb: 'For a professional with a few meetings a week.', cta: 'Start free trial' },
  { id: 'pro', name: 'Pro', price: 99, period: 'per month', hours: 40, users: '1 user', blurb: 'For managers who live in meetings.', cta: 'Start free trial', featured: true },
  { id: 'team', name: 'Team', price: 349, period: 'per month', hours: 150, users: 'Up to 5 users', blurb: 'Shared minutes for a project or sales team.', cta: 'Start free trial' }
];
export const TRIAL_MINUTES = 180;
