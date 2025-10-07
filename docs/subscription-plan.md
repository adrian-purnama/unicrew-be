# Unicru Subscription Plan

## Overview
A comprehensive subscription system for both users and companies with tiered pricing and feature access.

## User Subscriptions

### 🆓 Free Tier
**Price:** $0/month
**Target:** Job seekers getting started

**Features:**
- ✅ 5 saved jobs
- ✅ 10 job applications per month
- ✅ 3 CV generations per month
- ✅ Basic job search
- ✅ Basic support

### ⭐ Premium Tier
**Price:** $9.99/month
**Target:** Active job seekers

**Features:**
- ✅ 50 saved jobs
- ✅ 100 job applications per month
- ✅ 50 CV generations per month
- ✅ Advanced job search filters
- ✅ Advanced analytics dashboard
- ✅ Priority support
- ✅ Email notifications
- ✅ Application tracking

### 🏢 Enterprise Tier
**Price:** $49.99/month
**Target:** Professional job seekers

**Features:**
- ✅ 200 saved jobs
- ✅ 500 job applications per month
- ✅ 200 CV generations per month
- ✅ Custom branding on CVs
- ✅ API access for integrations
- ✅ Dedicated support
- ✅ Advanced analytics
- ✅ All Premium features

## Company Subscriptions

### 🆓 Free Tier
**Price:** $0/month
**Target:** Small companies testing the platform

**Features:**
- ✅ 2 job posts total
- ✅ 1 active job at a time
- ✅ 50 applications per job
- ✅ Basic job posting
- ✅ Basic support

### ⭐ Premium Tier
**Price:** $29.99/month
**Target:** Growing companies

**Features:**
- ✅ 20 job posts total
- ✅ 10 active jobs at a time
- ✅ 500 applications per job
- ✅ Advanced job posting features
- ✅ Advanced analytics dashboard
- ✅ Priority support
- ✅ Email notifications
- ✅ Application management tools

### 🏢 Enterprise Tier
**Price:** $99.99/month
**Target:** Large companies and enterprises

**Features:**
- ✅ 100 job posts total
- ✅ 50 active jobs at a time
- ✅ 2000 applications per job
- ✅ Custom branding on job posts
- ✅ API access for integrations
- ✅ Dedicated support
- ✅ Advanced analytics
- ✅ All Premium features

## Implementation Strategy

### Phase 1: Basic Limits (Current)
- Implement CV generation limits
- Add subscription checks to existing features
- Update UI to show limits

### Phase 2: Advanced Features
- Add analytics dashboards
- Implement priority support
- Add email notifications

### Phase 3: Enterprise Features
- Custom branding
- API access
- Advanced integrations

## Technical Implementation

### Database Schema Updates
```javascript
// User Schema
subscription: { 
  type: String, 
  enum: ["free", "premium", "enterprise"], 
  default: "free" 
},
subscriptionExpiresAt: { type: Date },
billing: {
  stripeCustomerId: String,
  planId: String,
  lastPaymentDate: Date,
  subscriptionStatus: String,
}

// Company Schema
subscription: { 
  type: String, 
  enum: ["free", "premium", "enterprise"], 
  default: "free" 
},
subscriptionExpiresAt: { type: Date },
billing: {
  stripeCustomerId: String,
  planId: String,
  lastPaymentDate: Date,
  subscriptionStatus: String,
}
```

### Middleware Integration
- Add subscription checks to all relevant routes
- Implement usage tracking
- Add upgrade prompts in UI

### Frontend Integration
- Subscription status display
- Usage meters
- Upgrade prompts
- Billing management

## Revenue Projections

### Conservative Estimates
- 1000 free users → 50 premium users (5% conversion)
- 100 companies → 20 premium companies (20% conversion)
- Monthly Revenue: $1,000 (users) + $600 (companies) = $1,600

### Optimistic Estimates  
- 1000 free users → 100 premium users (10% conversion)
- 100 companies → 40 premium companies (40% conversion)
- Monthly Revenue: $2,000 (users) + $1,200 (companies) = $3,200

## Next Steps

1. **Update existing code** to use new subscription helper
2. **Add CV generation limits** to CV routes
3. **Create subscription management UI**
4. **Integrate payment processing** (Stripe)
5. **Add usage tracking** and analytics
6. **Implement upgrade flows**

## Benefits

### For Users
- Clear value proposition for upgrades
- Reasonable free tier to try the platform
- Premium features that enhance job search

### For Companies
- Affordable entry point with free tier
- Scalable pricing based on needs
- Advanced features for larger companies

### For Platform
- Predictable recurring revenue
- Clear upgrade paths
- Scalable business model

