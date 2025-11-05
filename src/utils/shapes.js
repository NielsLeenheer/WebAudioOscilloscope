export function generateCircle() {
    const points = [];
    const numPoints = 100;
    for (let i = 0; i < numPoints; i++) {
        const angle = (i / numPoints) * 2 * Math.PI;
        points.push([Math.cos(angle), Math.sin(angle)]);
    }
    return points;
}

export function generateSquare() {
    const points = [];
    const pointsPerSide = 25;

    // Top side
    for (let i = 0; i < pointsPerSide; i++) {
        points.push([-1 + (2 * i / pointsPerSide), 1]);
    }
    // Right side
    for (let i = 0; i < pointsPerSide; i++) {
        points.push([1, 1 - (2 * i / pointsPerSide)]);
    }
    // Bottom side
    for (let i = 0; i < pointsPerSide; i++) {
        points.push([1 - (2 * i / pointsPerSide), -1]);
    }
    // Left side
    for (let i = 0; i < pointsPerSide; i++) {
        points.push([-1, -1 + (2 * i / pointsPerSide)]);
    }

    return points;
}

export function generateTriangle() {
    const points = [];
    const pointsPerSide = 33;

    // Three vertices of equilateral triangle
    const v1 = [0, 1];
    const v2 = [-0.866, -0.5];
    const v3 = [0.866, -0.5];

    // Draw edges
    for (let i = 0; i < pointsPerSide; i++) {
        const t = i / pointsPerSide;
        points.push([v1[0] + (v2[0] - v1[0]) * t, v1[1] + (v2[1] - v1[1]) * t]);
    }
    for (let i = 0; i < pointsPerSide; i++) {
        const t = i / pointsPerSide;
        points.push([v2[0] + (v3[0] - v2[0]) * t, v2[1] + (v3[1] - v2[1]) * t]);
    }
    for (let i = 0; i < pointsPerSide; i++) {
        const t = i / pointsPerSide;
        points.push([v3[0] + (v1[0] - v3[0]) * t, v3[1] + (v1[1] - v3[1]) * t]);
    }

    return points;
}

export function generateStar() {
    const points = [];
    const numPoints = 10;
    const outerRadius = 1;
    const innerRadius = 0.4;

    for (let i = 0; i <= numPoints * 10; i++) {
        const angle = (i / (numPoints * 10)) * 2 * Math.PI;
        const pointNum = Math.floor(i / 10);
        const radius = pointNum % 2 === 0 ? outerRadius : innerRadius;

        const targetAngle = (pointNum / numPoints) * 2 * Math.PI - Math.PI / 2;
        const nextAngle = ((pointNum + 1) / numPoints) * 2 * Math.PI - Math.PI / 2;
        const t = (i % 10) / 10;

        const currentRadius = pointNum % 2 === 0 ? outerRadius : innerRadius;
        const nextRadius = (pointNum + 1) % 2 === 0 ? outerRadius : innerRadius;
        const interpRadius = currentRadius + (nextRadius - currentRadius) * t;
        const interpAngle = targetAngle + (nextAngle - targetAngle) * t;

        points.push([interpRadius * Math.cos(interpAngle), interpRadius * Math.sin(interpAngle)]);
    }

    return points;
}

export function generateHeart() {
    const points = [];
    const numPoints = 200;

    for (let i = 0; i < numPoints; i++) {
        const t = (i / numPoints) * 2 * Math.PI;
        // Parametric heart equation
        const x = 16 * Math.pow(Math.sin(t), 3);
        const y = 13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t);

        // Normalize to [-1, 1]
        points.push([x / 17, y / 17]);
    }

    return points;
}

export function generateSpiral() {
    const points = [];
    const numPoints = 200;
    const turns = 3;

    for (let i = 0; i < numPoints; i++) {
        const t = i / numPoints;
        const angle = t * turns * 2 * Math.PI;
        const radius = t * 0.9;
        points.push([radius * Math.cos(angle), radius * Math.sin(angle)]);
    }

    return points;
}

export function generateLissajous(a, b, delta = Math.PI / 2) {
    const points = [];
    const numPoints = 200;

    for (let i = 0; i < numPoints; i++) {
        const t = (i / numPoints) * 2 * Math.PI;
        const x = Math.sin(a * t + delta);
        const y = Math.sin(b * t);
        points.push([x, y]);
    }

    return points;
}

export function generateClockPoints() {
    const points = [];
    const now = new Date();
    const hours = now.getHours() % 12;
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();

    // Calculate angles (12 o'clock is at -90 degrees)
    const hourAngle = ((hours + minutes / 60) * 30 - 90) * Math.PI / 180;
    const minuteAngle = ((minutes + seconds / 60) * 6 - 90) * Math.PI / 180;
    const secondAngle = (seconds * 6 - 90) * Math.PI / 180;

    // Draw outer circle (100 points)
    const circlePoints = 100;
    for (let i = 0; i < circlePoints; i++) {
        const angle = (i / circlePoints) * 2 * Math.PI;
        points.push([0.9 * Math.cos(angle), -0.9 * Math.sin(angle)]);
    }

    // Draw hour hand (from center to 0.5 radius)
    for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        const r = t * 0.5;
        points.push([r * Math.cos(hourAngle), -r * Math.sin(hourAngle)]);
    }
    // Return to center
    for (let i = 20; i >= 0; i--) {
        const t = i / 20;
        const r = t * 0.5;
        points.push([r * Math.cos(hourAngle), -r * Math.sin(hourAngle)]);
    }

    // Draw minute hand (from center to 0.7 radius)
    for (let i = 0; i <= 25; i++) {
        const t = i / 25;
        const r = t * 0.7;
        points.push([r * Math.cos(minuteAngle), -r * Math.sin(minuteAngle)]);
    }
    // Return to center
    for (let i = 25; i >= 0; i--) {
        const t = i / 25;
        const r = t * 0.7;
        points.push([r * Math.cos(minuteAngle), -r * Math.sin(minuteAngle)]);
    }

    // Draw second hand (from center to 0.65 radius, thinner)
    for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        const r = t * 0.65;
        points.push([r * Math.cos(secondAngle), -r * Math.sin(secondAngle)]);
    }
    // Return to center
    for (let i = 20; i >= 0; i--) {
        const t = i / 20;
        const r = t * 0.65;
        points.push([r * Math.cos(secondAngle), -r * Math.sin(secondAngle)]);
    }

    // Draw center dot
    const dotPoints = 15;
    for (let i = 0; i < dotPoints; i++) {
        const angle = (i / dotPoints) * 2 * Math.PI;
        points.push([0.05 * Math.cos(angle), -0.05 * Math.sin(angle)]);
    }

    return points;
}

export function parseSVGPath(pathData, numSamples = 200, autoCenter = true) {
    // Create an SVG element to use the browser's path parsing
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    svg.appendChild(path);

    const totalLength = path.getTotalLength();

    if (totalLength === 0) {
        throw new Error('Invalid path or path has zero length');
    }

    const points = [];

    // Sample points along the path
    for (let i = 0; i < numSamples; i++) {
        const distance = (i / numSamples) * totalLength;
        const point = path.getPointAtLength(distance);
        points.push([point.x, point.y]);
    }

    // Close the path by adding the first point at the end
    if (points.length > 0) {
        points.push(points[0]);
    }

    if (autoCenter) {
        // Find bounding box
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        points.forEach(([x, y]) => {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        });

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const width = maxX - minX;
        const height = maxY - minY;
        const scale = 1.8 / Math.max(width, height); // Scale to fit in [-1, 1] range with some margin

        // Normalize points to [-1, 1] range
        return points.map(([x, y]) => [
            (x - centerX) * scale,
            -(y - centerY) * scale  // Flip Y axis (SVG Y goes down, oscilloscope Y goes up)
        ]);
    } else {
        // Use raw coordinates (user needs to ensure they're in reasonable range)
        return points.map(([x, y]) => [x / 100, -y / 100]); // Divide by 100 as a default scale
    }
}
