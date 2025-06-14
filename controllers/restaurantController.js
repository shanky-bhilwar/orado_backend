const Restaurant = require("../models/restaurantModel")
const RestaurantEarning = require('../models/RestaurantEarningModel');
const Permission = require("../models/restaurantPermissionModel");
const Order = require("../models/orderModel")
const Product = require("../models/productModel")
const Category = require("../models/categoryModel")


const mongoose = require("mongoose");
const { uploadOnCloudinary } = require('../utils/cloudinary'); 


exports.createRestaurant = async (req, res) => {
  try {
    console.log(req.body);

    // 1️⃣ Required fields validation
    const requiredFields = [
      'name', 'ownerName', 'phone', 'email', 
      'password', // Password is now required
      'fssaiNumber', 'gstNumber', 'aadharNumber',
      'address.street', 'address.city', 'address.state',
      'foodType', 'openingHours'
    ];

    const missingFields = requiredFields.filter(field => {
      const nestedFields = field.split('.');
      let value = req.body;
      for (const f of nestedFields) {
        value = value?.[f];
        if (value === undefined) break;
      }
      return value === undefined || value === '';
    });

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`,
        code: 'REQUIRED_FIELD_MISSING'
      });
    }

    // 2️⃣ Password validation
    if (req.body.password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long',
        code: 'WEAK_PASSWORD'
      });
    }

    // 3️⃣ foodType validation
    const validFoodTypes = ['veg', 'non-veg', 'both'];
    if (!validFoodTypes.includes(req.body.foodType.trim())) {
      return res.status(400).json({
        success: false,
        message: `Invalid foodType. Allowed: ${validFoodTypes.join(', ')}`,
        code: 'INVALID_FOOD_TYPE'
      });
    }

    // 4️⃣ openingHours validation
    let openingHours;
    try {
      openingHours = JSON.parse(req.body.openingHours);
      if (!Array.isArray(openingHours)) throw new Error();
    } catch {
      return res.status(400).json({
        success: false,
        message: `Invalid openingHours. Expected a valid JSON array.`,
        code: 'INVALID_OPENING_HOURS'
      });
    }

    // 5️⃣ Required documents check
    const requiredDocs = {
      fssaiDoc: 'FSSAI License',
      gstDoc: 'GST Certificate',
      aadharDoc: 'Aadhar Card'
    };

    const missingDocs = Object.keys(requiredDocs)
      .filter(doc => !req.files?.[doc]?.[0])
      .map(doc => requiredDocs[doc]);

    if (missingDocs.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing documents: ${missingDocs.join(', ')}`,
        code: 'DOCUMENT_REQUIRED'
      });
    }

    // 6️⃣ Payment methods sanitization and validation
    const allowedPaymentMethods = ['online', 'cod', 'wallet'];
    let paymentMethods = req.body.paymentMethods;

    if (typeof paymentMethods === 'string') {
      paymentMethods = paymentMethods.split(',').map(m => m.trim());
    } else if (!paymentMethods) {
      paymentMethods = ['online'];
    }

    const invalidMethods = paymentMethods.filter(m => !allowedPaymentMethods.includes(m));
    if (invalidMethods.length) {
      return res.status(400).json({
        success: false,
        message: `Invalid payment methods: ${invalidMethods.join(', ')}. Allowed: ${allowedPaymentMethods.join(', ')}`
      });
    }

    // 7️⃣ Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(req.body.password, salt);

    // 8️⃣ Upload KYC documents to Cloudinary
    const fssaiDoc = await uploadOnCloudinary(req.files.fssaiDoc[0].path);
    const gstDoc = await uploadOnCloudinary(req.files.gstDoc[0].path);
    const aadharDoc = await uploadOnCloudinary(req.files.aadharDoc[0].path);

    if (!fssaiDoc || !gstDoc || !aadharDoc) {
      throw new Error('Document upload failed');
    }

    // 9️⃣ Slug generation
    const slug = `${req.body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${req.body.address.city.toLowerCase()}-${Math.random().toString(36).substring(2, 6)}`;

    // 🔟 Final restaurant data prep
    const restaurantData = {
      name: req.body.name.trim(),
      ownerName: req.body.ownerName.trim(),
      address: {
        street: req.body.address.street.trim(),
        city: req.body.address.city.trim(),
        state: req.body.address.state.trim(),
        zip: req.body.address.pincode || req.body.address.zip || '',
      },
      location: {
        type: 'Point',
        coordinates: [
          parseFloat(req.body.address.longitude) || 0,
          parseFloat(req.body.address.latitude) || 0
        ]
      },
      phone: req.body.phone.trim(),
      email: req.body.email.trim(),
      password: hashedPassword, // Store hashed password
      openingHours,
      foodType: req.body.foodType.trim(),
      minOrderAmount: req.body.minOrderAmount || 100,
      paymentMethods,
      kyc: {
        fssaiNumber: req.body.fssaiNumber.trim(),
        gstNumber: req.body.gstNumber.trim(),
        aadharNumber: req.body.aadharNumber.trim(),
      },
      kycDocuments: {
        fssaiDocUrl: fssaiDoc.secure_url,
        gstDocUrl: gstDoc.secure_url,
        aadharDocUrl: aadharDoc.secure_url
      },
    };

    const newRestaurant = await Restaurant.create(restaurantData);
     await Permission.create({
      restaurantId: newRestaurant._id,// Assuming you have the authenticated user
      permissions: {
        canManageMenu: true,
        canAcceptOrder: false,
        canRejectOrder: false,
        canManageOffers: false,
        canViewReports: true
      }
    });

    return res.status(201).json({
      success: true,
      code: 'RESTAURANT_CREATED',
      data: {
        restaurantId: newRestaurant._id,
        approvalStatus: newRestaurant.approvalStatus
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Something went wrong',
      error: err.message
    });
  }
};






exports.updateRestaurant = async (req, res) => {
  try {
    if (!req.body) return res.status(400).json({ message: 'Request body is missing.' });

    const { restaurantId } = req.params;
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) return res.status(404).json({ message: 'Restaurant not found.' });

    const {
      name,
      address,
      phone,
      email,
      openingHours,
      foodType,
      merchantSearchName,
      minOrderAmount,
      paymentMethods,
      isActive,
      status
    } = req.body;

    // Update basic fields if they exist
    if (name) restaurant.name = name;
    if (phone) restaurant.phone = phone;
    if (email) restaurant.email = email;
    if (foodType) restaurant.foodType = foodType;
    if (merchantSearchName) restaurant.merchantSearchName = merchantSearchName;
    if (minOrderAmount) restaurant.minOrderAmount = minOrderAmount;
    if (paymentMethods) restaurant.paymentMethods = paymentMethods;
    if (openingHours) restaurant.openingHours = openingHours;
    if (isActive !== undefined) restaurant.isActive = isActive;
    if (status) restaurant.status = status;

    // 🧭 Address and Location
    if (address) {
      restaurant.address.street = address?.street || restaurant.address.street;
      restaurant.address.city = address?.city || restaurant.address.city;
      restaurant.address.state = address?.state || restaurant.address.state;
      restaurant.address.zip = address?.pincode || restaurant.address.zip;

      if (address.coordinates && address.coordinates.length === 2) {
        restaurant.location = {
          type: "Point",
          coordinates: [address.coordinates[1], address.coordinates[0]],
        };
      }
    }

    if (req.files && req.files.length > 0) {
      const uploads = await Promise.all(
        req.files.map(file => uploadOnCloudinary(file.path))
      );
      const newImageUrls = uploads
        .filter(result => result && result.secure_url)
        .map(result => result.secure_url);

      // Replace images
      restaurant.images = newImageUrls;
    }

    await restaurant.save();
    res.status(200).json({
      message: 'Restaurant updated successfully.',
      restaurant
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error.', error });
  }
};



exports.deleteRestaurant = async (req, res) => {
  try {
    const { restaurantId } = req.params;

    if (!restaurantId) {
      return res.status(400).json({ message: 'restaurantId is required.' });
    }

    if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
      return res.status(400).json({ message: 'Invalid restaurantId format.' });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found.' });
    }

    // Delete the restaurant
    await restaurant.deleteOne();

    //  Also delete the associated permission
    await Permission.deleteOne({ restaurantId });

    res.status(200).json({ message: 'Restaurant and its permissions deleted successfully.' });

  } catch (error) {
    console.error('Error deleting restaurant:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};


exports.getRestaurantById = async (req, res) => {
 
  try {

    const { restaurantId } = req.params;
  
    if (!restaurantId) {
      return res.status(400).json({ message: 'restaurantId is required.' });
    }
      if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
      return res.status(400).json({ message: 'Invalid restaurantId format.' });
    }
       const restaurant = await Restaurant.findOne({_id: restaurantId });
        if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found.' });
    }

       res.status(200).json({ message: 'Restaurant fetched successfully.', data:restaurant });
  
  } catch (error) {
     console.error(error);
    res.status(500).json({ message: 'Server error.' });
  }

}

exports.updateBusinessHours = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { businessHours } = req.body;

    if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) {
      return res.status(400).json({ message: 'Invalid or missing restaurantId.' });
    }

    if (!businessHours || typeof businessHours !== 'object') {
      return res.status(400).json({ message: 'businessHours must be a valid object.' });
    }

    const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;

    for (const [day, times] of Object.entries(businessHours)) {
      if (!validDays.includes(day)) {
        return res.status(400).json({ message: `Invalid day: ${day}` });
      }

      const { startTime, endTime, closed } = times;

      if (closed === true) continue;

      if (!startTime || !endTime) {
        return res.status(400).json({ message: `Missing startTime or endTime for ${day}.` });
      }

      if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
        return res.status(400).json({ message: `Invalid time format for ${day}. Use HH:mm.` });
      }
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found.' });
    }

    restaurant.businessHours = businessHours;
    await restaurant.save();

    return res.status(200).json({
      message: 'Business hours updated successfully.',
      businessHours: restaurant.businessHours
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error.' });
  }
};


exports.addKyc = async (req, res) => {
  try {
    const { restaurantId } = req.params;

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found." });
    }

    let kycUrls = [];
    if (req.files && req.files.length > 0) {
      console.log("Uploading files to Cloudinary...");
      const uploads = await Promise.all(
        req.files.map(file => uploadOnCloudinary(file.path))
      );
      console.log("Uploads result:", uploads);

      kycUrls = uploads
        .filter(result => result && result.secure_url)
        .map(result => result.secure_url);
    }

    restaurant.kycDocuments = [...restaurant.kycDocuments, ...kycUrls];

    restaurant.kycStatus = "pending";

    await restaurant.save();

    res.status(200).json({
      message: "KYC documents uploaded successfully.",
      restaurant,
    });

  } catch (error) {
    console.error("KYC upload error:", error);
    res.status(500).json({ message: "Server error while uploading KYC." });
  }
};

exports.getKyc = async (req, res) => {
  try {
    const { restaurantId } = req.params;

    const restaurant = await Restaurant.findById(restaurantId);

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found." });
    }

    res.status(200).json({
      message: "KYC details fetched successfully.",
      kycDocuments: restaurant.kycDocuments || [],
      kycStatus: restaurant.kycStatus || "not-submitted",
    });

  } catch (error) {
    console.error("Error fetching KYC:", error);
    res.status(500).json({ message: "Server error while fetching KYC." });
  }

};






exports.addServiceArea = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { serviceAreas } = req.body;
   console.log(restaurantId)
    if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
      return res.status(400).json({
        message: "Invalid restaurant ID",
        messageType: "failure",
      });
    }

    

    if (!Array.isArray(serviceAreas) || serviceAreas.length === 0) {
      return res.status(400).json({
        message: "serviceAreas must be a non-empty array of GeoJSON Polygons",
        messageType: "failure",
      });
    }

    // Validate each polygon
    for (const area of serviceAreas) {
      if (
        !area.type ||
        area.type !== "Polygon" ||
        !Array.isArray(area.coordinates) ||
        area.coordinates.length === 0
      ) {
        return res.status(400).json({
          message: "Each serviceArea must be a valid GeoJSON Polygon with coordinates",
          messageType: "failure",
        });
      }
    }

    // Cast restaurantId to ObjectId
    const restaurantObjectId =  new mongoose.Types.ObjectId(restaurantId);

    const restaurant = await Restaurant.findById(restaurantObjectId);
    if (!restaurant) {
      return res.status(404).json({
        message: "Restaurant not found",
        messageType: "failure",
      });
    }

    restaurant.serviceAreas = serviceAreas;
    await restaurant.save();

    return res.status(200).json({
      message: "Service areas updated successfully",
      messageType: "success",
      data: restaurant.serviceAreas,
    });
  } catch (error) {
    console.error("Error updating serviceAreas:", error);
    return res.status(500).json({
      message: "Server error",
      messageType: "failure",
    });
  }
};


exports.getRestaurantMenu = async (req, res) => {
  const { restaurantId } = req.params;
console.log("hi")
  try {
    // Validate restaurantId
    if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
      return res.status(400).json({
        message: 'Invalid restaurantId format',
        messageType: 'failure',
        data: null,
      });
    }

    // Fetch all active categories for this restaurant
    const categories = await Category.find({ restaurantId, active: true });

    if (!categories.length) {
      return res.status(404).json({
        message: 'No categories found for this restaurant.',
        messageType: 'failure',
        data: null
      });
    }

    // Fetch all products for each category (no pagination)
    const menu = await Promise.all(
      categories.map(async (category) => {
        const products = await Product.find({
          restaurantId,
          categoryId: category._id,
        }).select('-revenueShare -costPrice -profitMargin');

        return {
          categoryId: category._id,
          categoryName: category.name,
          description: category.description,
          images: category.images,
          totalProducts: products.length,
          items: products
        };
      })
    );

    res.status(200).json({
      message: 'Menu fetched successfully',
      messageType: 'success',
      data: menu
    });

  } catch (error) {
    console.error('Error fetching menu:', error);
    res.status(500).json({
      message: 'Failed to fetch restaurant menu',
      messageType: 'failure',
      data: null
    });
  }
};

// get all restauants

exports.getAllApprovedRestaurants = async (req, res) => {
  try {
    const approvedRestaurants = await Restaurant.find().select('-kycDocuments')
    res.status(200).json({
      message: "Approved restaurants fetched successfully.",
      count: approvedRestaurants.length,
      restaurants: approvedRestaurants,
    });
  } catch (error) {
    console.error("Error fetching approved restaurants:", error);
    res.status(500).json({
      message: "Failed to fetch approved restaurants.",
      error: error.message,
    });
  }
};



exports.updateRestaurantOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    // Validate order exists
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Update order status
    order.status = status;

    // If restaurant provides estimated prep time, update it
   

    await order.save();

    res.status(200).json({
      message: "Order status updated successfully",
      order
    });
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({
      message: "Failed to update order status",
      error: error.message
    });
  }
};
    
     

 exports.getRestaurantEarningSummary = async (req, res) => {
  try {
    const { restaurantId } = req.params;

    // Find all earnings for the restaurant
    const totalEarnings = await RestaurantEarning.find({ restaurantId: restaurantId });

    // Calculate totals manually since find() returns array of docs
    const summary = totalEarnings.reduce(
      (acc, curr) => {
        acc.totalAmount += curr.totalOrderAmount || 0;
        acc.totalRevenue += curr.revenueShareAmount || 0;
        return acc;
      },
      { totalAmount: 0, totalRevenue: 0 }
    );

    res.status(200).json({
      success: true,
      summary,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to fetch earning summary' });
  }
};

