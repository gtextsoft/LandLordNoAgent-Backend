const mongoose = require('mongoose');
const Property = require('./models/Property');
const User = require('./models/User');

// Connect to MongoDB
const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://gvest_new209030:EDw69JyAaU7BNFuQ@gtextcluster.3g8di.mongodb.net/LandlordNoAgent';

async function seedProperties() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    // Create a sample landlord user if it doesn't exist
    let landlord = await User.findOne({ email: 'landlord@example.com' });
    
    if (!landlord) {
      landlord = new User({
        email: 'landlord@example.com',
        password: 'password123',
        role: 'landlord',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        isEmailVerified: true,
        isVerified: true  // Required for landlord to list properties; allows seeded properties to be visible
      });
      await landlord.save();
      console.log('Created sample landlord user (verified)');
    } else {
      // Ensure existing seeded landlord is verified so they can list/add properties
      if (!landlord.isVerified) {
        landlord.isVerified = true;
        await landlord.save();
        console.log('Updated existing landlord to verified');
      }
    }

    // Clear existing properties
    await Property.deleteMany({});
    console.log('Cleared existing properties');

    // Normalize images to schema: [{ url, isPrimary, uploadedAt }]
    const toImageObjects = (urls) => urls.map((url, i) => ({
      url,
      caption: '',
      isPrimary: i === 0,
      uploadedAt: new Date()
    }));

    // Create sample properties
    const sampleProperties = [
      {
        title: 'Modern Downtown Apartment',
        description: 'Beautiful 2-bedroom apartment in the heart of downtown with stunning city views. Features modern amenities and is close to public transportation.',
        price: 2500,
        address: {
          street: '123 Main Street',
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          country: 'USA'
        },
        propertyType: 'apartment',
        rentalType: 'long-term',
        images: toImageObjects([
          'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&h=600&fit=crop',
          'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&h=600&fit=crop'
        ]),
        bedrooms: 2,
        bathrooms: 2,
        squareFeet: 1200,
        features: ['Air Conditioning', 'Dishwasher', 'Hardwood Floors', 'Balcony'],
        status: 'active',
        isAvailable: true,
        isVerified: true,
        landlord: landlord._id
      },
      {
        title: 'Cozy Suburban House',
        description: 'Perfect family home with a large backyard and modern amenities. Great neighborhood with excellent schools nearby.',
        price: 3200,
        address: {
          street: '456 Oak Avenue',
          city: 'Los Angeles',
          state: 'CA',
          zipCode: '90210',
          country: 'USA'
        },
        propertyType: 'house',
        rentalType: 'long-term',
        images: toImageObjects([
          'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800&h=600&fit=crop',
          'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&h=600&fit=crop'
        ]),
        bedrooms: 3,
        bathrooms: 2,
        squareFeet: 1800,
        features: ['Garage', 'Garden', 'Central Air', 'Fireplace'],
        status: 'active',
        isAvailable: true,
        isVerified: true,
        landlord: landlord._id
      },
      {
        title: 'Luxury Penthouse Suite',
        description: 'Exclusive penthouse with panoramic views and premium finishes. Perfect for professionals who want luxury living.',
        price: 5500,
        address: {
          street: '789 Park Avenue',
          city: 'New York',
          state: 'NY',
          zipCode: '10022',
          country: 'USA'
        },
        propertyType: 'condo',
        rentalType: 'long-term',
        images: toImageObjects([
          'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&h=600&fit=crop',
          'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&h=600&fit=crop'
        ]),
        bedrooms: 3,
        bathrooms: 3,
        squareFeet: 2500,
        features: ['City Views', 'Concierge', 'Gym', 'Rooftop Access'],
        status: 'active',
        isAvailable: true,
        isVerified: true,
        landlord: landlord._id
      },
      {
        title: 'Charming Studio Loft',
        description: 'Perfect for young professionals, this stylish studio loft offers urban living at its finest.',
        price: 1800,
        address: {
          street: '321 Industrial Way',
          city: 'Chicago',
          state: 'IL',
          zipCode: '60601',
          country: 'USA'
        },
        propertyType: 'studio',
        rentalType: 'long-term',
        images: toImageObjects([
          'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&h=600&fit=crop',
          'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&h=600&fit=crop'
        ]),
        bedrooms: 1,
        bathrooms: 1,
        squareFeet: 800,
        features: ['High Ceilings', 'Exposed Brick', 'Modern Kitchen', 'Walk-in Closet'],
        status: 'active',
        isAvailable: true,
        isVerified: true,
        landlord: landlord._id
      },
      {
        title: 'Family-Friendly Townhouse',
        description: 'Spacious townhouse perfect for families with children. Safe neighborhood with playground nearby.',
        price: 2800,
        address: {
          street: '654 Elm Street',
          city: 'Austin',
          state: 'TX',
          zipCode: '73301',
          country: 'USA'
        },
        propertyType: 'townhouse',
        rentalType: 'long-term',
        images: toImageObjects([
          'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&h=600&fit=crop',
          'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&h=600&fit=crop'
        ]),
        bedrooms: 4,
        bathrooms: 2,
        squareFeet: 2000,
        features: ['Backyard', 'Playground', 'Good Schools', 'Parking'],
        status: 'active',
        isAvailable: true,
        isVerified: true,
        landlord: landlord._id
      },
      {
        title: 'Beachfront Condo',
        description: 'Stunning beachfront condo with ocean views. Perfect for those who love the coastal lifestyle.',
        price: 4200,
        address: {
          street: '987 Ocean Drive',
          city: 'Miami',
          state: 'FL',
          zipCode: '33139',
          country: 'USA'
        },
        propertyType: 'condo',
        rentalType: 'long-term',
        images: toImageObjects([
          'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&h=600&fit=crop',
          'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&h=600&fit=crop'
        ]),
        bedrooms: 2,
        bathrooms: 2,
        squareFeet: 1500,
        features: ['Ocean View', 'Balcony', 'Pool Access', 'Beach Access'],
        status: 'active',
        isAvailable: true,
        isVerified: true,
        landlord: landlord._id
      }
    ];

    // Insert sample properties
    await Property.insertMany(sampleProperties);
    console.log(`✅ Created ${sampleProperties.length} sample properties`);

    console.log('🎉 Database seeding completed successfully!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
}

seedProperties();
