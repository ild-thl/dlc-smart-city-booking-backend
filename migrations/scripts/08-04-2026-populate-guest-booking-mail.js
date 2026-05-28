module.exports = {
  name: "08-04-2026-populate-guest-booking-mail",

  up: async function (mongoose) {
    const GUEST_BOOKING_CONSTANTS = Object.freeze({
      GUEST_NAME: "Teilnehmende ohne Angaben",
      GUEST_EMAIL: "guest-booking@dlc.sh",
    });

    const Booking = mongoose.model("Booking");

    // Find all bookings with empty or missing mail field
    const bookingsToUpdate = await Booking.find({
      $or: [{ mail: "" }, { mail: null }, { mail: { $exists: false } }],
    });

    console.log(
      `Found ${bookingsToUpdate.length} booking(s) with empty or missing mail field`,
    );

    if (bookingsToUpdate.length === 0) {
      console.log("No bookings to update. Migration skipped.");
      return;
    }

    // Update all bookings with empty/missing mail to guest email
    const result = await Booking.updateMany(
      {
        $or: [{ mail: "" }, { mail: null }, { mail: { $exists: false } }],
      },
      { $set: { mail: GUEST_BOOKING_CONSTANTS.GUEST_EMAIL } },
    );

    console.log(`Updated ${result.modifiedCount} booking(s) with guest email`);

    // Log the IDs of updated bookings for verification
    if (bookingsToUpdate.length > 0) {
      const updatedIds = bookingsToUpdate.map((b) => b.id);
      console.log("Updated booking IDs:", updatedIds);
    }
  },

  down: async function (mongoose) {
    const Booking = mongoose.model("Booking");

    // Remove the guest email to revert to empty string
    // This is a safe rollback since we only modify guest bookings
    const result = await Booking.updateMany(
      { mail: GUEST_BOOKING_CONSTANTS.GUEST_EMAIL },
      { $set: { mail: "" } },
    );

    console.log(
      `Rollback: Reset ${result.modifiedCount} booking(s) mail to empty`,
    );
  },
};
