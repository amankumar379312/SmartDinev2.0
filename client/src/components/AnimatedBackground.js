import React, { useEffect, useRef } from "react";
import * as THREE from "three";

export default function AnimatedBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0f172a, 0.002);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 1000);
    camera.position.z = 100;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const particleCount = 700;
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const sizes = [];
    const speeds = [];

    for (let i = 0; i < particleCount; i++) {
      positions.push((Math.random() * 2 - 1) * 300);
      positions.push((Math.random() * 2 - 1) * 200);
      positions.push((Math.random() * 2 - 1) * 100);
      sizes.push(Math.random() * 2);
      speeds.push(Math.random() * 0.2 + 0.05);
    }

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));
    geometry.userData = { speeds };

    const getTexture = () => {
      const cvs = document.createElement("canvas");
      cvs.width = 32;
      cvs.height = 32;
      const ctx = cvs.getContext("2d");
      const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 32, 32);
      return new THREE.CanvasTexture(cvs);
    };

    const material = new THREE.PointsMaterial({
      color: 0xf59e0b,
      size: 1.5,
      map: getTexture(),
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    let mouseX = 0;
    let mouseY = 0;

    const onMouseMove = (event) => {
      mouseX = (event.clientX / window.innerWidth) * 2 - 1;
      mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
    };

    let animationId;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      const positions = particles.geometry.attributes.position.array;
      const speeds = particles.geometry.userData.speeds;

      for (let i = 0; i < particleCount; i++) {
        positions[i * 3 + 1] += speeds[i];
        if (positions[i * 3 + 1] > 100) {
          positions[i * 3 + 1] = -100;
          positions[i * 3] = (Math.random() * 2 - 1) * 300;
        }
      }
      particles.geometry.attributes.position.needsUpdate = true;
      particles.rotation.x += 0.0005;
      particles.rotation.y += 0.0005;

      camera.position.x += (mouseX * 10 - camera.position.x) * 0.05;
      camera.position.y += (-mouseY * 10 - camera.position.y) * 0.05;
      camera.lookAt(scene.position);

      renderer.render(scene, camera);
    };

    animate();
    document.addEventListener("mousemove", onMouseMove);
    window.addEventListener("resize", onResize);

    function onResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }

    return () => {
      cancelAnimationFrame(animationId);
      document.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
    };
  }, []);

  return (
    <>
      <div
        className="fixed inset-0 z-0 pointer-events-none"
        style={{ background: "linear-gradient(135deg, #0b0f1a 0%, #111827 50%, #1a0a00 100%)" }}
      />
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div
          style={{
            position: "absolute",
            top: "-10%",
            left: "-5%",
            width: 600,
            height: 600,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(234,88,12,0.18) 0%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-10%",
            right: "-5%",
            width: 500,
            height: 500,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(59,130,246,0.10) 0%, transparent 70%)",
            filter: "blur(80px)",
          }}
        />
      </div>
      <canvas ref={canvasRef} className="fixed inset-0 z-0 pointer-events-none opacity-80" />
    </>
  );
}
