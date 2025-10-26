package middleware

import (
	"scholar-backend/internal/common/utils"
	"strings"

	"github.com/gin-gonic/gin"
)

// AuthMiddleware validates JWT tokens
func AuthMiddleware(requiredType string) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			utils.Unauthorized(c, "Authorization header is required")
			c.Abort()
			return
		}

		// Extract token from "Bearer <token>"
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			utils.Unauthorized(c, "Invalid authorization header format")
			c.Abort()
			return
		}

		token := parts[1]
		claims, err := utils.ParseToken(token)
		if err != nil {
			utils.Unauthorized(c, "Invalid or expired token")
			c.Abort()
			return
		}

		// Check user type if required
		if requiredType != "" && claims.Type != requiredType {
			utils.Unauthorized(c, "Insufficient permissions")
			c.Abort()
			return
		}

		// Store claims in context
		c.Set("user_id", claims.UserID)
		c.Set("username", claims.Username)
		c.Set("user_type", claims.Type)

		c.Next()
	}
}

// AdminAuthMiddleware validates admin JWT tokens
func AdminAuthMiddleware() gin.HandlerFunc {
	return AuthMiddleware("admin")
}

// UserAuthMiddleware validates user JWT tokens
func UserAuthMiddleware() gin.HandlerFunc {
	return AuthMiddleware("user")
}
