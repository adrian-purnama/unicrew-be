// helper/ratingHelper.js
const Review = require("../schema/reviewSchema");
const User = require("../schema/userSchema");
const Company = require("../schema/companySchema");
const mongoose = require("mongoose");

/**
 * Recalculate and update average rating for a user or company
 * @param {String} revieweeId - ID of the entity being reviewed
 * @param {String} revieweeType - "User" or "Company"
 * @returns {Object} Updated rating info { average, count, previousAverage }
 */
async function recalculateAndUpdateRating(revieweeId, revieweeType) {
    try {
        // Validate inputs
        if (!revieweeId || !revieweeType) {
            throw new Error("revieweeId and revieweeType are required");
        }

        if (!mongoose.Types.ObjectId.isValid(revieweeId)) {
            throw new Error("Invalid revieweeId format");
        }

        if (!["User", "Company"].includes(revieweeType)) {
            throw new Error("revieweeType must be 'User' or 'Company'");
        }

        // Get all reviews for this reviewee, sorted by creation date
        const reviews = await Review.find({
            reviewee: new mongoose.Types.ObjectId(revieweeId),
            revieweeType: revieweeType
        }).select('rating createdAt').sort({ createdAt: 1 }).lean();

        const totalReviews = reviews.length;
        let averageRating = 0;
        let previousAverage = 0;

        if (totalReviews > 0) {
            // Calculate current average
            const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
            averageRating = totalRating / totalReviews;

            // Calculate previous average (before the most recent review)
            if (totalReviews > 1) {
                const previousTotal = totalRating - reviews[totalReviews - 1].rating;
                previousAverage = previousTotal / (totalReviews - 1);
            }
        }

        // Round to 1 decimal place
        const roundedAverage = Math.round(averageRating * 10) / 10;
        const roundedPreviousAverage = Math.round(previousAverage * 10) / 10;

        // Update the appropriate collection
        const updateData = {
            'rating.average': roundedAverage,
            'rating.count': totalReviews,
            'rating.lastUpdated': new Date()
        };

        let updateResult = null;

        if (revieweeType === "User") {
            // Always update User collection for users
            updateResult = await User.findByIdAndUpdate(revieweeId, updateData, { 
                new: true, 
                select: 'rating fullName' 
            });
            
            if (!updateResult) {
                throw new Error(`User with ID ${revieweeId} not found`);
            }
        } else if (revieweeType === "Company") {
            // First try User collection (companies stored as users with role="company")
            const userCompany = await User.findOne({ 
                _id: new mongoose.Types.ObjectId(revieweeId), 
                role: "company" 
            });
            
            if (userCompany) {
                // Update in User collection
                updateResult = await User.findByIdAndUpdate(revieweeId, updateData, { 
                    new: true, 
                    select: 'rating companyName' 
                });
            } else {
                // Try Company collection as fallback
                updateResult = await Company.findByIdAndUpdate(revieweeId, updateData, { 
                    new: true, 
                    select: 'rating companyName' 
                });
            }
            
            if (!updateResult) {
                throw new Error(`Company with ID ${revieweeId} not found in User or Company collections`);
            }
        }

        console.log(`✅ Updated ${revieweeType} ${revieweeId} rating: ${roundedAverage}/5 (${totalReviews} reviews)`);
        
        return {
            average: roundedAverage,
            count: totalReviews,
            previousAverage: roundedPreviousAverage,
            change: Math.round((roundedAverage - roundedPreviousAverage) * 10) / 10,
            distribution: calculateRatingDistribution(reviews),
            entityName: updateResult.fullName || updateResult.companyName || 'Unknown'
        };
    } catch (error) {
        console.error("❌ Error recalculating ratings:", error);
        throw new Error(`Failed to recalculate ratings: ${error.message}`);
    }
}

/**
 * Calculate rating distribution
 * @param {Array} reviews - Array of review objects with rating field
 * @returns {Object} Distribution object { 1: count, 2: count, ... }
 */
function calculateRatingDistribution(reviews) {
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    
    reviews.forEach(review => {
        if (review.rating >= 1 && review.rating <= 5) {
            distribution[review.rating]++;
        }
    });
    
    return distribution;
}

/**
 * Get comprehensive rating statistics for a user or company
 * @param {String} entityId - ID of the entity
 * @param {String} entityType - "User" or "Company"
 * @returns {Object} Comprehensive rating statistics
 */
async function getRatingStats(entityId, entityType) {
    try {
        // Validate inputs
        if (!entityId || !entityType) {
            throw new Error("entityId and entityType are required");
        }

        if (!mongoose.Types.ObjectId.isValid(entityId)) {
            throw new Error("Invalid entityId format");
        }

        const reviews = await Review.find({
            reviewee: new mongoose.Types.ObjectId(entityId),
            revieweeType: entityType
        }).select('rating createdAt comment reviewer reviewerType').sort({ createdAt: -1 }).lean();

        if (reviews.length === 0) {
            return {
                average: 0,
                count: 0,
                distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
                recentReviews: 0,
                monthlyTrend: [],
                percentagePositive: 0,
                hasReviews: false
            };
        }

        // Calculate basic stats
        const totalReviews = reviews.length;
        const average = reviews.reduce((sum, review) => sum + review.rating, 0) / totalReviews;
        const roundedAverage = Math.round(average * 10) / 10;

        // Calculate distribution
        const distribution = calculateRatingDistribution(reviews);

        // Count recent reviews (last 30 days)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const recentReviews = reviews.filter(review => review.createdAt > thirtyDaysAgo).length;

        // Calculate positive percentage (4+ stars)
        const positiveReviews = reviews.filter(review => review.rating >= 4).length;
        const percentagePositive = Math.round((positiveReviews / totalReviews) * 100);

        // Calculate monthly trend (last 6 months)
        const monthlyTrend = calculateMonthlyTrend(reviews);

        return {
            average: roundedAverage,
            count: totalReviews,
            distribution,
            recentReviews,
            monthlyTrend,
            percentagePositive,
            hasReviews: true,
            lastReviewDate: reviews[0].createdAt,
            mostCommonRating: Object.keys(distribution).reduce((a, b) => 
                distribution[a] > distribution[b] ? a : b
            )
        };
    } catch (error) {
        console.error("❌ Error getting rating stats:", error);
        throw new Error(`Failed to get rating stats: ${error.message}`);
    }
}

/**
 * Calculate monthly review trend for the last 6 months
 * @param {Array} reviews - Array of reviews sorted by date (newest first)
 * @returns {Array} Monthly trend data
 */
function calculateMonthlyTrend(reviews) {
    const trend = [];
    const now = new Date();
    
    for (let i = 5; i >= 0; i--) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
        
        const monthReviews = reviews.filter(review => {
            const reviewDate = new Date(review.createdAt);
            return reviewDate >= monthStart && reviewDate <= monthEnd;
        });
        
        const monthAverage = monthReviews.length > 0 
            ? monthReviews.reduce((sum, review) => sum + review.rating, 0) / monthReviews.length 
            : 0;

        trend.push({
            month: monthStart.toLocaleString('default', { month: 'short', year: 'numeric' }),
            average: Math.round(monthAverage * 10) / 10,
            count: monthReviews.length
        });
    }
    
    return trend;
}

/**
 * Batch update ratings for multiple entities (useful for data migration)
 * @param {Array} entities - Array of { id, type } objects
 * @param {Object} options - Options { concurrency: number, onProgress: function }
 * @returns {Array} Results array
 */
async function batchUpdateRatings(entities, options = {}) {
    const { concurrency = 5, onProgress } = options;
    const results = [];
    
    // Process in batches to avoid overwhelming the database
    for (let i = 0; i < entities.length; i += concurrency) {
        const batch = entities.slice(i, i + concurrency);
        
        const batchPromises = batch.map(async (entity) => {
            try {
                const result = await recalculateAndUpdateRating(entity.id, entity.type);
                return { success: true, entity, result };
            } catch (error) {
                console.error(`Failed to update rating for ${entity.type} ${entity.id}:`, error);
                return { success: false, entity, error: error.message };
            }
        });
        
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        // Call progress callback if provided
        if (onProgress) {
            onProgress(i + batch.length, entities.length);
        }
        
        // Small delay between batches to be gentle on the database
        if (i + concurrency < entities.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`✅ Batch rating update complete: ${successful} successful, ${failed} failed`);
    
    return {
        results,
        summary: {
            total: entities.length,
            successful,
            failed,
            successRate: Math.round((successful / entities.length) * 100)
        }
    };
}

/**
 * Validate review data before submission
 * @param {Object} reviewData - Review data to validate
 * @returns {Object} Validation result { isValid, errors }
 */
function validateReviewData(reviewData) {
    const errors = [];
    
    // Required fields
    if (!reviewData.applicationId) {
        errors.push("Application ID is required");
    }
    
    if (!reviewData.rating) {
        errors.push("Rating is required");
    } else if (reviewData.rating < 1 || reviewData.rating > 5) {
        errors.push("Rating must be between 1 and 5");
    }
    
    // Optional field validation
    if (reviewData.comment && reviewData.comment.length > 2000) {
        errors.push("Comment cannot exceed 2000 characters");
    }
    
    if (reviewData.comment && reviewData.comment.trim().length < 10 && reviewData.comment.trim().length > 0) {
        errors.push("Comment must be at least 10 characters long");
    }
    
    if (reviewData.tags && (!Array.isArray(reviewData.tags) || reviewData.tags.length > 10)) {
        errors.push("Tags must be an array with maximum 10 items");
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Get review summary for an entity
 * @param {String} entityId - Entity ID
 * @param {String} entityType - "User" or "Company"
 * @returns {Object} Review summary
 */
async function getReviewSummary(entityId, entityType) {
    try {
        const [stats, recentReviews] = await Promise.all([
            getRatingStats(entityId, entityType),
            Review.find({
                reviewee: entityId,
                revieweeType: entityType
            })
            .populate('reviewer', 'fullName companyName profilePicture')
            .select('rating comment createdAt reviewer reviewerType')
            .sort({ createdAt: -1 })
            .limit(5)
            .lean()
        ]);

        return {
            ...stats,
            recentReviews: recentReviews.map(review => ({
                _id: review._id,
                rating: review.rating,
                comment: review.comment,
                date: review.createdAt,
                reviewerName: review.reviewer?.fullName || review.reviewer?.companyName || 'Anonymous',
                reviewerType: review.reviewerType,
                reviewerProfilePicture: review.reviewer?.profilePicture
            }))
        };
    } catch (error) {
        console.error("Error getting review summary:", error);
        throw error;
    }
}

async function recalculateRatings(revieweeId, revieweeType) {
    try {
        // Get all reviews for this reviewee
        const reviews = await Review.find({
            reviewee: revieweeId,
            revieweeType: revieweeType
        }).select('rating').lean();

        const totalReviews = reviews.length;
        const averageRating = totalReviews > 0 
            ? reviews.reduce((sum, review) => sum + review.rating, 0) / totalReviews 
            : 0;

        // Round to 1 decimal place
        const roundedAverage = Math.round(averageRating * 10) / 10;

        // Update the appropriate collection
        if (revieweeType === "User") {
            await User.findByIdAndUpdate(revieweeId, {
                'rating.average': roundedAverage,
                'rating.count': totalReviews
            });
        } else if (revieweeType === "Company") {
            // Check if company exists in User collection (role: "company") or Company collection
            const userCompany = await User.findOne({ _id: revieweeId, role: "company" });
            
            if (userCompany) {
                // Update in User collection
                await User.findByIdAndUpdate(revieweeId, {
                    'rating.average': roundedAverage,
                    'rating.count': totalReviews
                });
            } else {
                // Update in Company collection
                await Company.findByIdAndUpdate(revieweeId, {
                    'rating.average': roundedAverage,
                    'rating.count': totalReviews
                });
            }
        }

        console.log(`Updated ${revieweeType} ${revieweeId} rating: ${roundedAverage} (${totalReviews} reviews)`);
        
        return {
            average: roundedAverage,
            count: totalReviews
        };
    } catch (error) {
        console.error("Error recalculating ratings:", error);
        throw error;
    }
}

module.exports = {
    recalculateAndUpdateRating,
    recalculateRatings,
    getRatingStats,
    batchUpdateRatings,
    validateReviewData,
    getReviewSummary,
    calculateRatingDistribution
};