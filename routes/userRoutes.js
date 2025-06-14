const express = require("express");
const router = express.Router();




const { registerUser, verifyOtp, loginUser,addAddress, deleteAddressById,editaddress, updateAddressById , resendOtp,forgotPassword ,resetPassword, logoutUser, logoutAll ,deleteUser ,getNotificationPrefs,updateNotificationPrefs, getAddress,
      addFavouriteRestaurant,
    getFavouriteRestaurants,
    removeFavouriteRestaurant,
        getUserNotifications, markAllAsRead,markAsRead,deleteAccount
} = require("../controllers/userControllers");





const bruteForcePrevent = require("../middlewares/bruteforcePrevent");

const {addAgentReview} = require('../controllers/agentController')
const {protect, checkRole} = require('../middlewares/authMiddleware')

// // Routes
router.post("/register", registerUser);

// router.post("/verify-otp",verifyOtp);

router.post("/resend-otp", resendOtp);
router.post("/login", loginUser);
router.get("/adderss/:userId",getAddress)
router.post("/address", protect, checkRole('customer'), addAddress)
router.post("/address",addAddress)
router.put("/address/:addressId", protect, checkRole('customer'), updateAddressById)
router.put("/:userId/addresses/:addressId",updateAddressById)

router.delete("/delete/:addressId ", protect, checkRole('customer'), deleteAddressById)

router.post("/forgot-password", protect, checkRole('customer'), forgotPassword)
router.post("/reset-password/:token", protect, checkRole('customer'), resetPassword)

router.post("/logout", protect, checkRole('customer'), logoutUser);
router.post("/logout-all", protect, checkRole('customer'), logoutAll);

// GDPR-delete
// router.delete("/delete/:userId",deleteUser)



// post agent review
router.post("/:agentId/review", protect, checkRole('customer'), addAgentReview);


router.get("/:userId/notifications/preferences",getNotificationPrefs)
router.put("/:userId/notifications/preferences",updateNotificationPrefs)


//notificaton
router.get('/notifications', protect, getUserNotifications);
// router.patch('/notifications/:id/read', protect, markAsRead);
router.patch('/notifications/mark-all-read', protect, markAllAsRead);


router.get("/notifications/preferences", protect, getNotificationPrefs)
router.put("/notifications/preferences/update", protect, updateNotificationPrefs)

// Delete Account
router.delete("/delete-account", protect, deleteAccount);



router.post("/fav/restaurants",protect,addFavouriteRestaurant)
router.get("/fav/restaurants",protect,getFavouriteRestaurants)
router.put('/fav/restaurants/remove',protect,removeFavouriteRestaurant);

module.exports = router;
