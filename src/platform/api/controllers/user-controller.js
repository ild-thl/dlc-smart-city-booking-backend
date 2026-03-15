const UserManager = require("../../../commons/data-managers/user-manager");
const { User } = require("../../../commons/entities/user/user");
const bunyan = require("bunyan");
const PermissionService = require("../../../commons/services/permission-service");
const TenantManager = require("../../../commons/data-managers/tenant-manager");
const { RolePermission } = require("../../../commons/entities/role/role");
const UserIdentityService = require("../../../commons/services/user-identity-service");
const UserModel = require("../../../commons/data-managers/models/userModel");

const logger = bunyan.createLogger({
  name: "user-controller.js",
  level: process.env.LOG_LEVEL,
});

class UserPermissions {
  static async _allowCreate(userId) {
    return !!(await PermissionService._isInstanceOwner(userId));
  }

  static async _allowRead(user, userId) {
    const permissions = await UserManager.getUserPermissions(userId);
    if (
      (await PermissionService._isInstanceOwner(userId)) ||
      permissions.tenants.some((p) => p.isOwner)
    ) {
      return true;
    } else {
      return PermissionService._isSelf(user, userId);
    }
  }

  static async _allowUpdate(affectedUser, userId) {
    return !!(await PermissionService._isInstanceOwner(userId));
  }

  static async _allowDelete(affectedUser, userId) {
    return !!(
      (await PermissionService._isInstanceOwner(userId)) ||
      PermissionService._isSelf(affectedUser, userId)
    );
  }
}

/**
 * Web Controller for Events.
 */
class UserController {
  /**
   * Retrieves a list of users that the current user is allowed to read.
   *
   * @param {Object} request - The request object.
   * @param {Object} response - The response object.
   * @returns {Promise<void>} - A promise that resolves when the users are retrieved and sent in the response.
   */
  static async getUsers(request, response) {
    try {
      const user = request.user;

      const userObjects = await UserManager.getUsers();

      const allowedUserObjects = [];
      for (const userObject of userObjects) {
        if (await UserPermissions._allowRead(userObject, user.id)) {
          allowedUserObjects.push(userObject);
        }
      }

      logger.info(
        `Instance -- sending ${allowedUserObjects.length} users to user ${user?.id}`,
      );
      response.status(200).send(allowedUserObjects);
    } catch (error) {
      logger.error(error);
      response.status(500).send("Could not get Users");
    }
  }

  static async getUsersByTenant(request, response) {
    try {
      const user = request.user;
      const tenantId = request.params.tenant;

      if (
        !(await PermissionService._allowReadAny(
          user.id,
          tenantId,
          RolePermission.MANAGE_USERS,
        ))
      ) {
        logger.warn(`User ${user?.id} not allowed to get tenant users`);
        response.sendStatus(403);
        return;
      }
      const tenantUsers = await TenantManager.getTenantUsers(tenantId);

      logger.info(
        `Instance -- sending ${tenantUsers.length} users to user ${user?.id}`,
      );
      response.status(200).send(tenantUsers);
    } catch (error) {
      logger.error(error);
      response.status(500).send("Could not get Users");
    }
  }

  /**
   * Retrieves a specific user that the current user is allowed to read.
   *
   * @param {Object} request - The request object.
   * @param {Object} response - The response object.
   * @returns {Promise<void>} - A promise that resolves when the user is retrieved and sent in the response.
   */
  static async getUser(request, response) {
    try {
      const tenantId = request.params.tenant;
      const user = request.user;
      const id = request.params.id;

      if (id) {
        if (await UserPermissions._allowRead(user, user.id, tenantId)) {
          const userObject = await UserManager.getUser(id);
          logger.info(
            `${tenantId} -- Sending user ${userObject.id} to user ${user?.id}`,
          );
          response.status(200).send(userObject);
        } else {
          logger.warn(
            `${tenantId} -- User ${user?.id} is not allowed to read user ${id}`,
          );
          response.sendStatus(403);
        }
      } else {
        response.sendStatus(400);
      }
    } catch (error) {
      logger.error(error);
      response.status(500).send("Could not get user");
    }
  }

  /**
   * @obsolete Use createUser or updateUser instead.
   * @param request
   * @param response
   * @returns {Promise<void>}
   */
  static async storeUser(request, response) {
    const userObject = new User(request.body);

    const isUpdate = !!(await UserManager.getUser(userObject.id));

    if (isUpdate) {
      await UserController.updateUser(request, response);
    } else {
      await UserController.createUser(request, response);
    }
  }

  /**
   * Creates a new user.
   *
   * @param {Object} request - The request object.
   * @param {Object} response - The response object.
   * @returns {Promise<void>} - A promise that resolves when the user is created.
   */
  static async createUser(request, response) {
    try {
      const user = request.user;
      if (await UserPermissions._allowCreate(user.id)) {
        const userObject = new User(request.body);
        userObject.setPassword(userObject.secret);
        const newUser = await UserManager.storeUser(userObject);
        logger.info(
          ` Instance -- created user ${userObject.id} by user ${user?.id}`,
        );
        response.status(200).send(newUser);
      } else {
        logger.warn(`Instance -- User ${user?.id} not allowed to create user`);
        response.sendStatus(403);
      }
    } catch (error) {
      logger.error(error);
      response.status(500).send("could not create user");
    }
  }

  /**
   * Updates a user's information.
   *
   * @param {Object} request - The request object.
   * @param {Object} response - The response object.
   * @returns {Promise<void>} - A promise that resolves when the user is updated.
   */
  static async updateUser(request, response) {
    try {
      const user = request.user;

      const newInfos = { id: request.body.id };

      const fields = [
        "firstName",
        "lastName",
        "company",
        "phone",
        "address",
        "zipCode",
        "city",
        "isVerified",
        "isSuspended",
      ];

      fields.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(request.body, field)) {
          newInfos[field] = request.body[field];
        }
      });

      if (await UserPermissions._allowUpdate(newInfos, user.id)) {
        await UserManager.storeUser(newInfos);
        logger.info(`updated user ${newInfos.id} by user ${user?.id}`);
        response.sendStatus(200);
      } else {
        logger.warn(`User ${user?.id} not allowed to update user`);
        response.sendStatus(403);
      }
    } catch (error) {
      logger.error(error);
      response.status(500).send("could not update user");
    }
  }

  /**
   * Removes a user.
   *
   * @param {Object} request - The request object.
   * @param {Object} response - The response object.
   * @returns {Promise<void>} - A promise that resolves when the user is removed.
   */
  static async removeUser(request, response) {
    try {
      const tenantId = request.params.tenant;
      const user = request.user;

      const id = request.params.id;
      if (id) {
        const userObject = await UserManager.getUser(id);
        if (await UserPermissions._allowDelete(userObject, user.id)) {
          await UserManager.deleteUser(id);
          logger.info(`${tenantId} -- removed user ${id} by user ${user?.id}`);
          response.sendStatus(200);
        } else {
          logger.warn(
            `${tenantId} -- User ${user?.id} not allowed to remove user`,
          );
          response.sendStatus(403);
        }
      } else {
        logger.warn(
          `${tenantId} -- Could not remove user by user ${user?.id}. Missing required parameters.`,
        );
        response.sendStatus(400);
      }
    } catch (error) {
      logger.error(error);
      response.status(500).send("could not remove user");
    }
  }

  /**
   * Updates the current user's information.
   *
   * @param {Object} request - The request object.
   * @param {Object} response - The response object.
   * @returns {Promise<void>} - A promise that resolves when the update is complete.
   */
  static async updateMe(request, response) {
    try {
      const user = await UserManager.getUser(request.user.id, true);

      const fields = [
        "firstName",
        "lastName",
        "company",
        "phone",
        "address",
        "zipCode",
        "city",
      ];

      fields.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(request.body, field)) {
          user[field] = request.body[field];
        }
      });

      await UserManager.storeUser(user);

      const updatedUser = await UserManager.getUser(user.id, false);

      request.session.passport.user.firstName = updatedUser.firstName;
      request.session.passport.user.lastName = updatedUser.lastName;
      request.session.passport.user.phone = updatedUser.phone;
      request.session.passport.user.address = updatedUser.address;
      request.session.passport.user.zipCode = updatedUser.zipCode;
      request.session.passport.user.city = updatedUser.city;
      request.session.save();

      response.status(200).send(updatedUser);
    } catch (error) {
      logger.error(error);
      response.status(500).send("could not update user");
    }
  }

  /**
   * Changes a user's ID (typically the email address) and updates references.
   * Restricted to instance owners.
   *
   * @param {Object} request - The request object.
   * @param {Object} response - The response object.
   * @returns {Promise<void>} - A promise that resolves when the update is complete.
   */
  static async changeUserId(request, response) {
    try {
      const actor = request.user;
      const isInstanceOwner = await PermissionService._isInstanceOwner(
        actor?.id,
      );
      const isAdminUser =
        actor?.id &&
        process.env.BOOKING_TOOL_ADMIN_ID &&
        actor.id.toLowerCase() === process.env.BOOKING_TOOL_ADMIN_ID.toLowerCase();
      const adminKeyHeader = request.get("x-booking-admin-key");
      const hasAdminKey =
        process.env.BOOKING_TOOL_ADMIN_API_KEY &&
        adminKeyHeader &&
        adminKeyHeader === process.env.BOOKING_TOOL_ADMIN_API_KEY;

      if (!isInstanceOwner && !isAdminUser && !hasAdminKey) {
        logger.warn(`User ${actor?.id} not allowed to change user ids`);
        response.sendStatus(403);
        return;
      }

      const oldId =
        typeof request.params.id === "string"
          ? request.params.id.trim().toLowerCase()
          : "";
      const newId =
        typeof request.body?.newId === "string"
          ? request.body.newId.trim().toLowerCase()
          : "";
      const keycloakId =
        typeof request.body?.keycloakId === "string"
          ? request.body.keycloakId.trim()
          : "";

      if (!newId || (!oldId && !keycloakId)) {
        response.status(400).send("Missing new id or identifier");
        return;
      }

      const result = await UserIdentityService.changeUserId(
        oldId,
        newId,
        keycloakId,
      );

      if (!result.updated && result.reason === "target_exists") {
        response.status(409).send("Target id already exists");
        return;
      }
      if (!result.updated && result.reason === "not_found") {
        response.status(404).send("User not found");
        return;
      }
      if (!result.updated && result.reason === "missing_id") {
        response.status(400).send("Missing old or new id");
        return;
      }

      if (request.body?.anonymize === true) {
        await UserModel.updateOne(
          { id: newId },
          { $set: { firstName: "Anonym", lastName: "" } },
        );
      }

      logger.info(`changed user id ${oldId} -> ${newId} by ${actor?.id}`);
      response
        .status(200)
        .send({ oldId, newId, updated: result.changed });
    } catch (error) {
      logger.error(error);
      response.status(500).send("could not change user id");
    }
  }

  /**
   * Update a user's first and last name (admin only).
   *
   * @param {Object} request - The request object.
   * @param {Object} response - The response object.
   * @returns {Promise<void>} - A promise that resolves when the update is complete.
   */
  static async updateUserNames(request, response) {
    try {
      const actor = request.user;
      const isInstanceOwner = await PermissionService._isInstanceOwner(
        actor?.id,
      );
      const isAdminUser =
        actor?.id &&
        process.env.BOOKING_TOOL_ADMIN_ID &&
        actor.id.toLowerCase() === process.env.BOOKING_TOOL_ADMIN_ID.toLowerCase();
      const adminKeyHeader = request.get("x-booking-admin-key");
      const hasAdminKey =
        process.env.BOOKING_TOOL_ADMIN_API_KEY &&
        adminKeyHeader &&
        adminKeyHeader === process.env.BOOKING_TOOL_ADMIN_API_KEY;

      if (!isInstanceOwner && !isAdminUser && !hasAdminKey) {
        logger.warn(`User ${actor?.id} not allowed to update user names`);
        response.sendStatus(403);
        return;
      }

      const userId =
        typeof request.params.id === "string"
          ? request.params.id.trim().toLowerCase()
          : "";
      const keycloakId =
        typeof request.body?.keycloakId === "string"
          ? request.body.keycloakId.trim()
          : "";
      const firstName =
        typeof request.body?.firstName === "string"
          ? request.body.firstName.trim()
          : "";
      const lastName =
        typeof request.body?.lastName === "string"
          ? request.body.lastName.trim()
          : "";

      if ((!userId && !keycloakId) || !firstName || !lastName) {
        response.status(400).send("Missing user identifier or names");
        return;
      }

      let resolvedId = userId;
      if (!resolvedId && keycloakId) {
        const byKeycloak = await UserManager.getUserByKeycloakId(
          keycloakId,
          true,
        );
        if (byKeycloak?.id) {
          resolvedId = byKeycloak.id.toLowerCase();
        }
      }

      if (!resolvedId) {
        response.status(404).send("User not found");
        return;
      }

      await UserModel.updateOne(
        { id: resolvedId },
        { $set: { firstName: firstName, lastName: lastName } },
      );

      response.status(200).send({ id: resolvedId, updated: true });
    } catch (error) {
      logger.error(error);
      response.status(500).send("could not update user names");
    }
  }

  /**
   * Retrieves a list of user IDs based on the specified roles.
   *
   * @param {Object} request - The request object.
   * @param {Object} response - The response object.
   * @returns {Promise<void>} - A promise that resolves when the user IDs are retrieved and sent in the response.
   */
  static async getUserIds(request, response) {
    try {
      const user = request.user;
      const tenant = request.params.tenant;
      const filterRoles = !!request.query.roles
        ? request.query.roles.split(",")
        : [];

      const userObjects = await UserManager.getUsers();

      const filteredUserObjects = userObjects.filter((userObject) => {
        if (filterRoles) {
          return filterRoles.some((role) => userObject.roles.includes(role));
        } else {
          return true;
        }
      });

      logger.info(
        `${tenant} -- sending ${filteredUserObjects.length} user ids to user ${user?.id}`,
      );
      response.status(200).send(filteredUserObjects.map((user) => user.id));
    } catch (err) {
      logger.error(err);
      response.status(500).send("Could not get User IDs");
    }
  }
}

module.exports = UserController;
