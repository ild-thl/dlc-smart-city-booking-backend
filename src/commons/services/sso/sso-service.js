const TenantManager = require("../../data-managers/tenant-manager");
const axios = require("axios");
const UserManager = require("../../data-managers/user-manager");
const { RoleManager } = require("../../data-managers/role-manager");
const { User } = require("../../entities/user");

class SsoService {
  static async handleLogin(tenantId, token) {
    const tenant = await TenantManager.getTenant(tenantId);
    const app = await TenantManager.getTenantApp(tenantId, "keycloak");
    let kcResponse = await SsoService.verifyToken(tenantId, token, app);

    let user = await UserManager.getUser(kcResponse.email);

    if (!user) {
      throw { message: "User not found", status: 404 };
    }

    const kcRoles = extractRoles(kcResponse.resource_access);

    if (app.roleMapping.active) {
      const roles = await SsoService.mapRoles(tenantId, user, kcRoles, app);

      if (
        tenant.users.some((userReference) => userReference.userId === user.id)
      ) {
        tenant.users
          .filter((userReference) => userReference.userId === user.id)
          .forEach((user) => (user.roles = [...new Set([...roles])]));
      } else {
        tenant.users.push({
          userId: user.id,
          roles: [...new Set([...roles])],
        });
      }

      await TenantManager.storeTenant(tenant);
    }

    user.permissions = await UserManager.getUserPermissions(
      user.id,
      user.tenant,
    );

    return user;
  }

  static async handleSignup(tenantId, token) {
    const tenant = await TenantManager.getTenant(tenantId);
    const app = await TenantManager.getTenantApp(tenantId, "keycloak");
    let kcResponse = await SsoService.verifyToken(tenantId, token, app);

    if (kcResponse.active === false) {
      throw { message: "User not active", status: 404 };
    }

    // Check if user already exists
    let user = await UserManager.getUser(kcResponse.email);
    if (user) {
      throw { message: "User already exist", status: 409 };
    }

    const kcRoles = extractRoles(kcResponse.resource_access);

    const newUser = new User({
      id: kcResponse.email,
      firstName: kcResponse.given_name,
      lastName: kcResponse.family_name,
      authType: "keycloak",
      isVerified: true,
    });

    // Create user in DB
    user = await UserManager.signupUser(newUser);

    if (app.roleMapping.active) {
      const roles = await SsoService.mapRoles(tenantId, user, kcRoles, app);

      tenant.users.push({
        userId: user.id,
        roles: [...new Set([...roles])],
      });

      await TenantManager.storeTenant(tenant);
    }
  }

  static async verifyToken(tenantId, userToken, app) {
    const url = `${app.serverUrl}/realms/${app.realm}/protocol/openid-connect/token/introspect`;
    const kcResponse = await axios.post(
      url,
      `client_id=${app.privateClient}&client_secret=${app.privateClientSecret}&token=${userToken}`,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );
    return kcResponse.data;
  }

  static async logout() {
    throw new Error("Method not implemented");
  }

  static async signup() {
    throw new Error("Method not implemented");
  }

  static async mapRoles(tenantId, user, keycloakRoles, app) {
    const tenantRoles = await RoleManager.getRoles(tenantId);
    const rolesToMap = app.roleMapping.roles;
    const userRoles = await UserManager.getUserRoles(user.id, tenantId);

    rolesToMap.forEach((role) => {
      if (
        keycloakRoles.includes(role.keycloakRole) &&
        !userRoles.includes(role.tenantRoleId)
      ) {
        if (!tenantRoles.find((tRole) => tRole.id === role.tenantRoleId)) {
          return;
        }
        userRoles.push(role.tenantRoleId);
      } else if (
        !keycloakRoles.includes(role.keycloakRole) &&
        userRoles.includes(role.tenantRoleId)
      ) {
        userRoles.splice(userRoles.indexOf(role.tenantRoleId), 1);
      }
    });
    return userRoles;
  }
}

function extractRoles(obj) {
  let allRoles = [];
  for (const key in obj) {
    if (obj[key].roles && Array.isArray(obj[key].roles)) {
      allRoles = allRoles.concat(obj[key].roles);
    }
  }
  return allRoles;
}

module.exports = SsoService;
