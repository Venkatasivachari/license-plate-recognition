import { useEffect, useRef } from "react";

/**
 * CyberBackground — Next-Gen Autonomous Vehicle Digital Twin Highway.
 * Features:
 * - 3D Perspective Digital Highway with moving autonomous vehicles (Sedans, SUVs, Commercial Trucks, Motorcycles)
 * - Volumetric forward headlight beams and rear laser taillight trails
 * - Real-time LiDAR pulse rings and optical target tracking HUD brackets
 * - Classification plate tags with authentic Indian category colors (Government Red, VIP Gold, EV Green, Commercial Yellow, Private White)
 * - Interactive mouse parallax and targeting reticle
 */
export function CyberBackground({ variant = "login" }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return undefined;

    let animId = 0;
    let width = Math.max(1, window.innerWidth || 1);
    let height = Math.max(1, window.innerHeight || 1);
    let dpr = 1;
    let mouse = { x: width * 0.5, y: height * 0.5, active: false };

    const resize = () => {
      const devicePixelRatio = window.devicePixelRatio;
      dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? Math.min(devicePixelRatio, 2) : 1;
      width = Math.max(1, window.innerWidth || 1);
      height = Math.max(1, window.innerHeight || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const onMouseMove = (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
    };
    const onMouseLeave = () => {
      mouse.active = false;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseleave", onMouseLeave);

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Digital Highway Vehicle Pool
    const vehicleTypes = [
      {
        type: "SEDAN",
        width: 38,
        length: 68,
        plate: "DL 01 GA 0001",
        category: "GOVT",
        bg: "#DC2626",
        text: "#FFFFFF",
        label: "GOVERNMENT OFFICIAL",
      },
      {
        type: "VIP SUV",
        width: 44,
        length: 74,
        plate: "MH 12 AB 7777",
        category: "VIP",
        bg: "#D97706",
        text: "#FEF3C7",
        label: "VIP DIGNITARY",
      },
      {
        type: "EV SEDAN",
        width: 40,
        length: 70,
        plate: "KA 03 EV 4521",
        category: "EV",
        bg: "#16A34A",
        text: "#FFFFFF",
        label: "ELECTRIC VEHICLE",
      },
      {
        type: "CARGO TRUCK",
        width: 52,
        length: 96,
        plate: "HR 26 CT 1234",
        category: "COMM",
        bg: "#EAB308",
        text: "#0F172A",
        label: "COMMERCIAL LOGISTICS",
      },
      {
        type: "BIKE",
        width: 18,
        length: 42,
        plate: "TN 09 BK 5432",
        category: "PVT",
        bg: "#FFFFFF",
        text: "#0F172A",
        label: "TWO-LINE MOTORCYCLE",
      },
      {
        type: "VIP CAR",
        width: 42,
        length: 72,
        plate: "UP 32 VIP 0009",
        category: "VIP",
        bg: "#D97706",
        text: "#FEF3C7",
        label: "STATE DIGNITARY",
      },
    ];

    // Vehicles traversing the lanes
    const vehicles = Array.from({ length: 6 }, (_, index) => {
      const laneIndex = (index % 4) - 1.5; // -1.5, -0.5, 0.5, 1.5
      return {
        ...vehicleTypes[index % vehicleTypes.length],
        lane: laneIndex * 0.48, // normalized lane offset
        z: 120 + index * 160 + Math.random() * 40, // 0 to 1000 depth
        speed: 3.5 + Math.random() * 1.8,
        scanPhase: Math.random() * Math.PI * 2,
      };
    });

    // Velocity Streaks
    const streaks = Array.from({ length: 24 }, () => ({
      lane: (Math.random() * 2 - 1) * 0.9,
      z: Math.random() * 900 + 50,
      speed: 12 + Math.random() * 14,
      length: 80 + Math.random() * 120,
      color: Math.random() > 0.4 ? "rgba(99, 102, 241, " : "rgba(6, 182, 212, ",
    }));

    // Distant Stars / Cyber Dust
    const stars = Array.from({ length: 50 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight * 0.45,
      size: Math.random() * 1.6 + 0.4,
      alpha: Math.random() * 0.6 + 0.2,
      twinkle: Math.random() * 0.02 + 0.005,
    }));

    let time = 0;

    const render = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      const horizonY = h * 0.44;
      const vanishingX = w * 0.5 + (mouse.active ? (mouse.x - w * 0.5) * 0.04 : 0);

      // Deep Cyber Sky Gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
      skyGrad.addColorStop(0, "#040711");
      skyGrad.addColorStop(0.65, "#080E21");
      skyGrad.addColorStop(1, "#0D1836");
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, horizonY);

      // Stars
      stars.forEach((s) => {
        s.alpha += Math.sin(time * s.twinkle) * 0.01;
        const clampedAlpha = Math.max(0.1, Math.min(0.85, s.alpha));
        ctx.fillStyle = `rgba(190, 215, 255, ${clampedAlpha})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // Ground / Highway Asphalt
      const groundGrad = ctx.createLinearGradient(0, horizonY, 0, h);
      groundGrad.addColorStop(0, "#090F1E");
      groundGrad.addColorStop(0.3, "#070B16");
      groundGrad.addColorStop(1, "#04060C");
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, horizonY, w, h - horizonY);

      // Horizon Laser Beam
      const horizonGlow = ctx.createLinearGradient(0, horizonY - 24, 0, horizonY + 36);
      horizonGlow.addColorStop(0, "rgba(99, 102, 241, 0)");
      horizonGlow.addColorStop(0.5, "rgba(99, 102, 241, 0.45)");
      horizonGlow.addColorStop(1, "rgba(6, 182, 212, 0)");
      ctx.fillStyle = horizonGlow;
      ctx.fillRect(0, horizonY - 24, w, 60);

      ctx.strokeStyle = "rgba(129, 140, 248, 0.55)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, horizonY);
      ctx.lineTo(w, horizonY);
      ctx.stroke();

      // 3D Perspective Highway Lanes
      const numLanes = 12;
      for (let i = -numLanes / 2; i <= numLanes / 2; i++) {
        const spread = (i / (numLanes / 2)) * (w * 0.95);
        const bottomX = vanishingX + spread * 1.65;
        const topX = vanishingX + spread * 0.03;

        const isCenter = i === 0;
        const isBoundary = Math.abs(i) === numLanes / 2;
        ctx.strokeStyle = isCenter
          ? "rgba(245, 158, 11, 0.5)"
          : isBoundary
            ? "rgba(99, 102, 241, 0.45)"
            : "rgba(99, 102, 241, 0.14)";
        ctx.lineWidth = isCenter ? 2.5 : isBoundary ? 2 : 1;

        ctx.beginPath();
        ctx.moveTo(topX, horizonY);
        ctx.lineTo(bottomX, h);
        ctx.stroke();
      }

      // Horizontal Distance Marker Waves
      const speedOffset = prefersReduced ? 0 : (time * 1.2) % 60;
      for (let j = 1; j <= 16; j++) {
        const rawProgress = (j * 60 + speedOffset) / (16 * 60);
        const progress = Math.pow(rawProgress, 3);
        const y = horizonY + progress * (h - horizonY);
        const lineAlpha = Math.min(1, progress * 1.5) * 0.28;

        ctx.strokeStyle = `rgba(99, 102, 241, ${lineAlpha})`;
        ctx.lineWidth = 1 + progress * 2;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Draw High-Speed Velocity Streaks
      if (!prefersReduced) {
        streaks.forEach((st) => {
          st.z -= st.speed;
          if (st.z <= 10) {
            st.z = 1000;
            st.lane = (Math.random() * 2 - 1) * 0.85;
          }
          const depth = 1 - st.z / 1000;
          const expDepth = Math.pow(depth, 2.6);
          const startY = horizonY + expDepth * (h - horizonY);
          const startX = vanishingX + st.lane * (w * 0.82) * Math.pow(depth, 1.7);

          const tailDepth = Math.max(0.01, depth - st.length / 1000);
          const expTail = Math.pow(tailDepth, 2.6);
          const tailY = horizonY + expTail * (h - horizonY);
          const tailX = vanishingX + st.lane * (w * 0.82) * Math.pow(tailDepth, 1.7);

          const alpha = Math.min(1, depth * 1.6) * 0.65;
          const grad = ctx.createLinearGradient(tailX, tailY, startX, startY);
          grad.addColorStop(0, `${st.color}0)`);
          grad.addColorStop(1, `${st.color}${alpha})`);

          ctx.strokeStyle = grad;
          ctx.lineWidth = Math.max(1.5, depth * 3.5);
          ctx.beginPath();
          ctx.moveTo(tailX, tailY);
          ctx.lineTo(startX, startY);
          ctx.stroke();
        });
      }

      // Draw 3D Perspective Autonomous Vehicles with Optical Targeting HUD
      vehicles.sort((a, b) => b.z - a.z); // Render from back to front
      vehicles.forEach((v) => {
        if (!prefersReduced) {
          v.z -= v.speed;
          if (v.z <= 20) {
            v.z = 980;
            v.lane = ((Math.random() * 4 | 0) - 1.5) * 0.48;
          }
        }

        const depth = 1 - v.z / 1000;
        if (depth < 0.05) return;

        const scale = Math.pow(depth, 2.4);
        const vehicleY = horizonY + scale * (h - horizonY);
        const vehicleX = vanishingX + v.lane * (w * 0.85) * Math.pow(depth, 1.6);
        const vW = Math.max(14, v.width * scale * 2.2);
        const vH = Math.max(18, v.length * scale * 2.2);

        const alpha = Math.min(1, depth * 1.5);

        // 1. Headlight Volumetric Cones (Forward Illumination)
        const lightLen = vH * 1.8;
        const lightSpread = vW * 1.4;
        const leftLight = ctx.createRadialGradient(
          vehicleX - vW * 0.28,
          vehicleY + vH * 0.2,
          2,
          vehicleX - vW * 0.35,
          vehicleY + lightLen,
          lightSpread
        );
        leftLight.addColorStop(0, `rgba(255, 255, 240, ${alpha * 0.45})`);
        leftLight.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = leftLight;
        ctx.beginPath();
        ctx.moveTo(vehicleX - vW * 0.3, vehicleY);
        ctx.lineTo(vehicleX - vW * 0.8, vehicleY + lightLen);
        ctx.lineTo(vehicleX + vW * 0.1, vehicleY + lightLen);
        ctx.closePath();
        ctx.fill();

        const rightLight = ctx.createRadialGradient(
          vehicleX + vW * 0.28,
          vehicleY + vH * 0.2,
          2,
          vehicleX + vW * 0.35,
          vehicleY + lightLen,
          lightSpread
        );
        rightLight.addColorStop(0, `rgba(255, 255, 240, ${alpha * 0.45})`);
        rightLight.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = rightLight;
        ctx.beginPath();
        ctx.moveTo(vehicleX + vW * 0.3, vehicleY);
        ctx.lineTo(vehicleX - vW * 0.1, vehicleY + lightLen);
        ctx.lineTo(vehicleX + vW * 0.8, vehicleY + lightLen);
        ctx.closePath();
        ctx.fill();

        // 2. Vehicle Body Chassis
        ctx.save();
        ctx.translate(vehicleX, vehicleY);

        // Shadow under vehicle
        ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.75})`;
        ctx.beginPath();
        ctx.ellipse(0, vH * 0.35, vW * 0.65, vH * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();

        // Metallic Hull
        const bodyGrad = ctx.createLinearGradient(-vW * 0.5, -vH * 0.5, vW * 0.5, vH * 0.5);
        bodyGrad.addColorStop(0, `rgba(30, 41, 59, ${alpha})`);
        bodyGrad.addColorStop(0.5, `rgba(15, 23, 42, ${alpha})`);
        bodyGrad.addColorStop(1, `rgba(10, 15, 29, ${alpha})`);
        ctx.fillStyle = bodyGrad;
        ctx.strokeStyle = `rgba(99, 102, 241, ${alpha * 0.65})`;
        ctx.lineWidth = Math.max(1, scale * 2);

        // Rounded Vehicle Polygon
        ctx.beginPath();
        ctx.roundRect(-vW * 0.5, -vH * 0.5, vW, vH, Math.max(3, vW * 0.18));
        ctx.fill();
        ctx.stroke();

        // Cabin Windshield / Roof
        const cabinW = vW * 0.72;
        const cabinH = vH * 0.45;
        ctx.fillStyle = `rgba(6, 182, 212, ${alpha * 0.35})`;
        ctx.strokeStyle = `rgba(6, 182, 212, ${alpha * 0.6})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(-cabinW * 0.5, -cabinH * 0.5 - vH * 0.05, cabinW, cabinH, Math.max(2, cabinW * 0.15));
        ctx.fill();
        ctx.stroke();

        // Red Taillights Glow
        ctx.fillStyle = `rgba(239, 68, 68, ${alpha * 0.95})`;
        ctx.shadowColor = "#EF4444";
        ctx.shadowBlur = Math.max(4, scale * 14);
        ctx.fillRect(-vW * 0.42, -vH * 0.48, vW * 0.22, Math.max(2, vH * 0.08));
        ctx.fillRect(vW * 0.2, -vH * 0.48, vW * 0.22, Math.max(2, vH * 0.08));
        ctx.shadowBlur = 0; // reset

        // 3. LiDAR Sensor Pulse Wave
        v.scanPhase += 0.04;
        const scanR = ((Math.sin(v.scanPhase) + 1) * 0.5) * (vW * 1.1) + vW * 0.3;
        ctx.strokeStyle = `rgba(6, 182, 212, ${(1 - scanR / (vW * 1.5)) * alpha * 0.5})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, scanR, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();

        // 4. Optical Target Tracking HUD Overlay (Bounding Box + Plate Classification Tag)
        if (depth > 0.18) {
          const hudPad = Math.max(4, scale * 10);
          const bX = vehicleX - vW * 0.5 - hudPad;
          const bY = vehicleY - vH * 0.5 - hudPad;
          const bW = vW + hudPad * 2;
          const bH = vH + hudPad * 2;
          const cornerL = Math.max(4, bW * 0.22);

          // Corner Brackets
          ctx.strokeStyle = v.bg;
          ctx.lineWidth = Math.max(1.2, scale * 2.2);

          // Top-left
          ctx.beginPath();
          ctx.moveTo(bX, bY + cornerL);
          ctx.lineTo(bX, bY);
          ctx.lineTo(bX + cornerL, bY);
          ctx.stroke();

          // Top-right
          ctx.beginPath();
          ctx.moveTo(bX + bW - cornerL, bY);
          ctx.lineTo(bX + bW, bY);
          ctx.lineTo(bX + bW, bY + cornerL);
          ctx.stroke();

          // Bottom-left
          ctx.beginPath();
          ctx.moveTo(bX, bY + bH - cornerL);
          ctx.lineTo(bX, bY + bH);
          ctx.lineTo(bX + cornerL, bY + bH);
          ctx.stroke();

          // Bottom-right
          ctx.beginPath();
          ctx.moveTo(bX + bW - cornerL, bY + bH);
          ctx.lineTo(bX + bW, bY + bH);
          ctx.lineTo(bX + bW, bY + bH - cornerL);
          ctx.stroke();

          // Floating License Plate Classification Tag
          if (depth > 0.32) {
            const tagW = Math.max(76, scale * 140);
            const tagH = Math.max(16, scale * 26);
            const tagX = vehicleX - tagW * 0.5;
            const tagY = bY - tagH - 4;

            // Plate Tag Background (Red for Govt, Gold for VIP, Green for EV, Yellow for Commercial)
            ctx.fillStyle = v.bg;
            ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(tagX, tagY, tagW, tagH, 3);
            ctx.fill();
            ctx.stroke();

            // Plate Number Text
            ctx.fillStyle = v.text;
            ctx.font = `700 ${Math.max(8, scale * 12)}px 'JetBrains Mono', monospace`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(v.plate, vehicleX, tagY + tagH * 0.5);

            // Sub-badge category label
            ctx.fillStyle = "rgba(190, 215, 255, 0.85)";
            ctx.font = `600 ${Math.max(6, scale * 9)}px 'Inter', sans-serif`;
            ctx.fillText(v.label, vehicleX, tagY - 6);
          }
        }
      });

      // 5. Interactive Mouse LiDAR Targeting Reticle
      if (mouse.active) {
        ctx.strokeStyle = "rgba(6, 182, 212, 0.4)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);

        // Crosshairs to mouse
        ctx.beginPath();
        ctx.moveTo(mouse.x, 0);
        ctx.lineTo(mouse.x, h);
        ctx.moveTo(0, mouse.y);
        ctx.lineTo(w, mouse.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Targeting ring
        ctx.strokeStyle = "rgba(99, 102, 241, 0.75)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 22, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = "rgba(6, 182, 212, 0.8)";
        ctx.font = "600 9px 'JetBrains Mono', monospace";
        ctx.fillText(`AI LIDAR: ${Math.round(mouse.x)}, ${Math.round(mouse.y)}`, mouse.x + 28, mouse.y + 4);
      }

      time += 1;
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseleave", onMouseLeave);
      cancelAnimationFrame(animId);
    };
  }, [variant]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        width: "100%",
        height: "100%",
        display: "block",
      }}
    />
  );
}
