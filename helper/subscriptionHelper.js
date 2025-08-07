// utils/subscriptionHelper.js

function getMaxSavedJobs(subscription) {
    return subscription === "premium" ? 50 : 2;
}

function getMaxApplyLimit(subscription) {
    return subscription === "premium" ? 20 : 5;
}

function getSubscriptionLabel(subscription) {
    return subscription === "premium" ? "Premium" : "Free";
}

function isPremium(subscription) {
    return subscription === "premium";
}

module.exports = {
    getMaxSavedJobs,
    getMaxApplyLimit,
    getSubscriptionLabel,
    isPremium,
};
