const UserModel = require("../data-managers/models/userModel");
const TenantModel = require("../data-managers/models/tenantModel");
const InstanceModel = require("../data-managers/models/instanceModel");
const BookingModel = require("../data-managers/models/bookingModel");
const GroupBookingModel = require("../data-managers/models/groupBookingModel");
const RoleModel = require("../data-managers/models/roleModel");
const BookableModel = require("../data-managers/models/bookableModel");
const EventModel = require("../data-managers/models/eventModel");
const CouponModel = require("../data-managers/models/couponModel");

class UserIdentityService {
  static async changeUserId(oldId, newId, keycloakId = null) {
    const oldIdNormalized =
      typeof oldId === "string" ? oldId.trim().toLowerCase() : "";
    const newIdNormalized =
      typeof newId === "string" ? newId.trim().toLowerCase() : "";
    const keycloakIdNormalized =
      typeof keycloakId === "string" ? keycloakId.trim() : "";

    if (!newIdNormalized) {
      return { updated: false, changed: false, reason: "missing_id" };
    }

    let resolvedOldId = oldIdNormalized;
    if (!resolvedOldId && keycloakIdNormalized) {
      const byKeycloak = await UserModel.findOne({
        keycloakId: keycloakIdNormalized,
      });
      if (byKeycloak?.id) {
        resolvedOldId = byKeycloak.id.toLowerCase();
      }
    }

    if (!resolvedOldId) {
      return { updated: false, changed: false, reason: "not_found" };
    }

    if (resolvedOldId === newIdNormalized) {
      if (keycloakIdNormalized) {
        await UserModel.updateOne(
          { id: resolvedOldId },
          { $set: { keycloakId: keycloakIdNormalized } },
        );
      }
      return { updated: true, changed: false, reason: "same_id" };
    }

    const existingTarget = await UserModel.findOne({ id: newIdNormalized });
    if (existingTarget) {
      return { updated: false, changed: false, reason: "target_exists" };
    }

    const existingUser = await UserModel.findOne({ id: resolvedOldId });
    if (!existingUser) {
      return { updated: false, changed: false, reason: "not_found" };
    }

    const userUpdate = { id: newIdNormalized };
    if (keycloakIdNormalized) {
      userUpdate.keycloakId = keycloakIdNormalized;
    }

    await UserModel.updateOne({ id: resolvedOldId }, { $set: userUpdate });

    await TenantModel.updateMany(
      { "users.userId": resolvedOldId },
      { $set: { "users.$[elem].userId": newIdNormalized } },
      { arrayFilters: [{ "elem.userId": resolvedOldId }] },
    );
    await TenantModel.updateMany(
      { ownerUserIds: resolvedOldId },
      { $set: { "ownerUserIds.$[elem]": newIdNormalized } },
      { arrayFilters: [{ elem: resolvedOldId }] },
    );

    await InstanceModel.updateMany(
      { ownerUserIds: resolvedOldId },
      { $set: { "ownerUserIds.$[elem]": newIdNormalized } },
      { arrayFilters: [{ elem: resolvedOldId }] },
    );
    await InstanceModel.updateMany(
      { allowedUsersToCreateTenant: resolvedOldId },
      { $set: { "allowedUsersToCreateTenant.$[elem]": newIdNormalized } },
      { arrayFilters: [{ elem: resolvedOldId }] },
    );

    await BookingModel.updateMany(
      { assignedUserId: resolvedOldId },
      { $set: { assignedUserId: newIdNormalized } },
    );
    await BookingModel.updateMany(
      { mail: resolvedOldId },
      { $set: { mail: newIdNormalized } },
    );

    await GroupBookingModel.updateMany(
      { assignedUserId: resolvedOldId },
      { $set: { assignedUserId: newIdNormalized } },
    );
    await GroupBookingModel.updateMany(
      { mail: resolvedOldId },
      { $set: { mail: newIdNormalized } },
    );

    await RoleModel.updateMany(
      { assignedUserId: resolvedOldId },
      { $set: { assignedUserId: newIdNormalized } },
    );
    await BookableModel.updateMany(
      { ownerUserId: resolvedOldId },
      { $set: { ownerUserId: newIdNormalized } },
    );
    await EventModel.updateMany(
      { ownerUserId: resolvedOldId },
      { $set: { ownerUserId: newIdNormalized } },
    );
    await CouponModel.updateMany(
      { ownerUserId: resolvedOldId },
      { $set: { ownerUserId: newIdNormalized } },
    );

    return { updated: true, changed: true };
  }
}

module.exports = UserIdentityService;
