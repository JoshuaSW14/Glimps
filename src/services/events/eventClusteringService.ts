/**
 * Event Clustering Service
 * Phase 2: Find nearby memories for event formation
 */

import { Memory } from '../../types';

/**
 * Clustering parameters for event formation
 */
export interface ClusteringParams {
  /** Time window in minutes (default: ±90 minutes) */
  timeWindowMinutes?: number;
  /** Distance threshold in meters (default: 150m) */
  distanceThresholdMeters?: number;
}

/**
 * Result of clustering analysis
 */
export interface ClusterResult {
  /** Memories that belong together */
  clusterMemories: Memory[];
  /** Whether these form a tight cluster */
  isTightCluster: boolean;
  /** Confidence that this is a real event (0-1) */
  clusterConfidence: number;
}

const DEFAULT_TIME_WINDOW_MINUTES = 90;
const DEFAULT_DISTANCE_THRESHOLD_METERS = 150;

export class EventClusteringService {
  /**
   * Find memories near a given memory (by time and optionally location)
   */
  async findNearbyMemories(
    targetMemory: Memory,
    allMemories: Memory[],
    params: ClusteringParams = {}
  ): Promise<Memory[]> {
    const timeWindow = params.timeWindowMinutes || DEFAULT_TIME_WINDOW_MINUTES;
    const distanceThreshold = params.distanceThresholdMeters || DEFAULT_DISTANCE_THRESHOLD_METERS;
    
    const targetTime = targetMemory.recordedAt.getTime();
    const timeWindowMs = timeWindow * 60 * 1000;
    
    return allMemories.filter(memory => {
      // Don't include the target itself
      if (memory.id === targetMemory.id) {
        return false;
      }
      
      // Check time proximity
      const memoryTime = memory.recordedAt.getTime();
      const timeDiff = Math.abs(memoryTime - targetTime);
      
      if (timeDiff > timeWindowMs) {
        return false;
      }
      
      // If both have location, check distance
      if (targetMemory.latitude && targetMemory.longitude &&
          memory.latitude && memory.longitude) {
        const distance = this.calculateDistance(
          targetMemory.latitude,
          targetMemory.longitude,
          memory.latitude,
          memory.longitude
        );
        
        if (distance > distanceThreshold) {
          return false;
        }
      }
      
      return true;
    });
  }
  
  /**
   * Analyze a group of memories to determine if they form a coherent cluster
   */
  analyzeCluster(memories: Memory[]): ClusterResult {
    if (memories.length === 0) {
      return {
        clusterMemories: [],
        isTightCluster: false,
        clusterConfidence: 0,
      };
    }
    
    if (memories.length === 1) {
      return {
        clusterMemories: memories,
        isTightCluster: true,
        clusterConfidence: 0.7, // Single memory is a valid event but lower confidence
      };
    }
    
    // Calculate time span
    const times = memories.map(m => m.recordedAt.getTime()).sort((a, b) => a - b);
    const timeSpanMinutes = (times[times.length - 1] - times[0]) / (60 * 1000);
    
    // Calculate location spread if available
    const memoriesWithLocation = memories.filter(m => m.latitude && m.longitude);
    let maxDistance = 0;
    
    if (memoriesWithLocation.length >= 2) {
      for (let i = 0; i < memoriesWithLocation.length; i++) {
        for (let j = i + 1; j < memoriesWithLocation.length; j++) {
          const dist = this.calculateDistance(
            memoriesWithLocation[i].latitude!,
            memoriesWithLocation[i].longitude!,
            memoriesWithLocation[j].latitude!,
            memoriesWithLocation[j].longitude!
          );
          maxDistance = Math.max(maxDistance, dist);
        }
      }
    }
    
    // Confidence scoring
    let confidence = 0.5; // Base confidence
    
    // More memories = higher confidence (up to a point)
    if (memories.length >= 3) confidence += 0.2;
    if (memories.length >= 5) confidence += 0.1;
    
    // Tight time clustering = higher confidence
    if (timeSpanMinutes <= 30) confidence += 0.2;
    else if (timeSpanMinutes <= 60) confidence += 0.1;
    
    // Tight location clustering = higher confidence
    if (memoriesWithLocation.length >= 2) {
      if (maxDistance <= 50) confidence += 0.2;
      else if (maxDistance <= 100) confidence += 0.1;
    }
    
    // Cap at 1.0
    confidence = Math.min(confidence, 1.0);
    
    const isTightCluster = confidence >= 0.7;
    
    return {
      clusterMemories: memories,
      isTightCluster,
      clusterConfidence: confidence,
    };
  }
  
  /**
   * Calculate distance between two lat/lng points using Haversine formula
   * Returns distance in meters
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371e3; // Earth radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    
    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c;
  }
  
  /**
   * Extract common location from a cluster of memories
   */
  extractClusterLocation(memories: Memory[]): {
    locationName?: string;
    latitude?: number;
    longitude?: number;
  } {
    const memoriesWithLocation = memories.filter(m => m.latitude && m.longitude);
    
    if (memoriesWithLocation.length === 0) {
      return {};
    }
    
    // Use most common location name if available
    const locationNames = memoriesWithLocation
      .map(m => m.locationName)
      .filter(Boolean) as string[];
    
    const locationNameCounts = new Map<string, number>();
    locationNames.forEach(name => {
      locationNameCounts.set(name, (locationNameCounts.get(name) || 0) + 1);
    });
    
    let mostCommonLocation: string | undefined;
    let maxCount = 0;
    locationNameCounts.forEach((count, name) => {
      if (count > maxCount) {
        maxCount = count;
        mostCommonLocation = name;
      }
    });
    
    // Calculate centroid for lat/lng
    const avgLat = memoriesWithLocation.reduce((sum, m) => sum + m.latitude!, 0) / memoriesWithLocation.length;
    const avgLng = memoriesWithLocation.reduce((sum, m) => sum + m.longitude!, 0) / memoriesWithLocation.length;
    
    return {
      locationName: mostCommonLocation,
      latitude: avgLat,
      longitude: avgLng,
    };
  }
}

export const eventClusteringService = new EventClusteringService();
