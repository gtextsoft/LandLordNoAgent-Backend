import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { connectDatabase } from '../config/database';
import { config } from '../config';
import { logger } from '../config/logger';
import User from '../models/User';
import { UserRole, JwtPayload } from '../types';

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Middleware to verify JWT token and authenticate user
 */
export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Access token required',
      });
      return;
    }

    // Verify the token
    const decoded = jwt.verify(token, config.auth.jwtSecret) as JwtPayload;
    
    // Get user from database to ensure they still exist and are active
    const user = await User.findById(decoded.userId).select('_id email role isVerified');

    if (!user) {
      res.status(401).json({
        success: false,
        error: 'User not found',
      });
      return;
    }

    // Add user info to request
    req.user = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role as UserRole,
      iat: decoded.iat,
      exp: decoded.exp,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success: false,
        error: 'Invalid token',
      });
      return;
    }

    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        error: 'Token expired',
      });
      return;
    }

    logger.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed',
    });
  }
};

/**
 * Middleware to check if user has required role
 */
export const requireRole = (allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
      });
      return;
    }

    next();
  };
};

/**
 * Middleware to check if user is verified
 */
export const requireVerification = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
    return;
  }

  // Get user verification status from database
  User.findById(req.user.userId).select('isVerified').then((user: any) => {
    if (!user?.isVerified) {
      res.status(403).json({
        success: false,
        error: 'Account verification required',
      });
      return;
    }
    next();
  }).catch((error: any) => {
    logger.error('Verification check error:', error);
    res.status(500).json({
      success: false,
      error: 'Verification check failed',
    });
  });
};

/**
 * Middleware to check if user owns the resource or is admin
 */
export const requireOwnershipOrAdmin = (resourceUserIdField: string = 'userId') => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    // Admin can access everything
    if (req.user.role === 'ADMIN') {
      next();
      return;
    }

    // Check if user owns the resource
    const resourceUserId = req.params[resourceUserIdField] || req.body[resourceUserIdField];
    
    if (!resourceUserId) {
      res.status(400).json({
        success: false,
        error: 'Resource user ID not found',
      });
      return;
    }

    if (req.user.userId !== resourceUserId) {
      res.status(403).json({
        success: false,
        error: 'Access denied: You can only access your own resources',
      });
      return;
    }

    next();
  };
};

/**
 * Middleware for optional authentication (doesn't fail if no token)
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, config.auth.jwtSecret) as JwtPayload;
      
      const user = await User.findById(decoded.userId).select('_id email role isVerified');

      if (user) {
        req.user = {
          userId: user._id.toString(),
          email: user.email,
          role: user.role as UserRole,
          iat: decoded.iat,
          exp: decoded.exp,
        };
      }
    }
  } catch (error) {
    // Silently ignore authentication errors for optional auth
    logger.debug('Optional auth error (ignored):', error);
  }

  next();
};

/**
 * Role-specific middleware shortcuts
 */
export const requireClient = requireRole(['CLIENT']);
export const requireLandlord = requireRole(['LANDLORD']);
export const requireAdmin = requireRole(['ADMIN']);
export const requireLandlordOrClient = requireRole(['LANDLORD', 'CLIENT']);
export const requireAdminOrLandlord = requireRole(['ADMIN', 'LANDLORD']);

/**
 * Middleware to log user actions for audit trail
 */
export const auditLog = (action: string, resourceType: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Store original res.json to intercept response
    const originalJson = res.json;
    
    res.json = function(body: any) {
    // Log the action after response is sent
    if (req.user) {
      // TODO: Implement audit log with MongoDB
      logger.info(`Audit log: User ${req.user.userId} performed ${action} on ${resourceType} ${req.params.id || 'unknown'}`);
    }
      
      return originalJson.call(this, body);
    };

    next();
  };
};
