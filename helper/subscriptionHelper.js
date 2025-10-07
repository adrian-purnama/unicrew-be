// utils/subscriptionHelper.js

// User Subscription Limits
function getMaxSavedJobs(subscription) {
    const limits = {
        free: 5,
        premium: 50,
    };
    return limits[subscription] || limits.free;
}

function getMaxApplyLimit(subscription) {
    const limits = {
        free: 10,
        premium: 100,
    };
    return limits[subscription] || limits.free;
}

function getMaxCVGenerations(subscription) {
    const limits = {
        free: 3,
        premium: 50,
    };
    return limits[subscription] || limits.free;
}

// Feature flags
function hasAdvancedAnalytics(subscription) {
    return subscription === "premium";
}

function hasPrioritySupport(subscription) {
    return subscription === "premium";
}

function hasCustomBranding(subscription) {
    return subscription === "premium";
}

function hasAPIAccess(subscription) {
    return subscription === "premium";
}

// Utilities
function getSubscriptionLabel(subscription) {
    const labels = {
        free: "Free",
        premium: "Premium",
        enterprise: "Enterprise"
    };
    return labels[subscription] || "Free";
}

function isPremium(subscription) {
    return subscription === "premium" || subscription === "enterprise";
}

function isEnterprise(subscription) {
    return subscription === "enterprise";
}

function getSubscriptionTier(subscription) {
    const tiers = {
        free: 1,
        premium: 2,
        enterprise: 3
    };
    return tiers[subscription] || 1;
}

// Company Subscription Limits
function getMaxJobPosts(subscription) {
    const limits = {
        free: 10,
        premium: 50,
    };
    return limits[subscription] || limits.free;
}

function getMaxActiveJobs(subscription) {
    const limits = {
        free: 1,
        premium: 10,
    };
    return limits[subscription] || limits.free;
}

function getMaxApplicationsPerJob(subscription) {
    const limits = {
        free: 50,
        premium: 500,
        enterprise: 2000
    };
    return limits[subscription] || limits.free;
}


// Pricing Information
function getSubscriptionPricing() {
    return {
        free: {
            price: 0,
            currency: "USD",
            interval: "month",
            features: [
                "5 saved jobs",
                "10 job applications",
                "3 CV generations",
                "Basic support"
            ]
        },
        premium: {
            price: 9.99,
            currency: "USD", 
            interval: "month",
            features: [
                "50 saved jobs",
                "100 job applications", 
                "50 CV generations",
                "Advanced analytics",
                "Priority support",
                "Email notifications"
            ]
        }
    };
}

// Company Pricing
function getCompanySubscriptionPricing() {
    return {
        free: {
            price: 0,
            currency: "USD",
            interval: "month",
            features: [
                "2 job posts",
                "1 active job",
                "50 applications per job",
                "Basic support"
            ]
        },
        premium: {
            price: 29.99,
            currency: "USD",
            interval: "month", 
            features: [
                "20 job posts",
                "10 active jobs",
                "500 applications per job",
                "Advanced analytics",
                "Priority support",
                "Email notifications"
            ]
        }
    };
}

module.exports = {
    // User limits
    getMaxSavedJobs,
    getMaxApplyLimit,
    getMaxCVGenerations,
    
    // Company limits
    getMaxJobPosts,
    getMaxActiveJobs,
    getMaxApplicationsPerJob,
    
    
    // Pricing
    getSubscriptionPricing,
    getCompanySubscriptionPricing,
};
