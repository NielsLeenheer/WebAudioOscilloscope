# Web Audio Oscilloscope

Generate 2D vector graphics on a real analog oscilloscope using audio signals. This project creates stereo audio waveforms that, when fed into an oscilloscope's X/Y inputs, draw shapes, animations, and even imported SVG graphics.

For those without access to vintage test equipment, a built-in virtual oscilloscope simulates the look and feel of a real CRT display—complete with phosphor glow and electron beam physics.

**[Live Demo →](https://scope.nielsleenheer.com)**

> ⚠️ **Turn down your volume first!** The generated signals can be loud and unpleasant through speakers or headphones. Lower your computer's volume before experimenting.

## Signal Generator

The generator creates 2D figures using stereo audio—the left channel controls horizontal (X) deflection and the right channel controls vertical (Y) deflection. This is the same technique used in vector displays and oscilloscope music.

The audio signal is output through your computer's speakers or headphone jack, so you can connect a real oscilloscope using a stereo audio cable with BNC adapters. Feed the left and right channels into the X and Y inputs of your scope to see the same figures on real hardware.

You can generate:

- **Basic Waveforms** - Sine, square, triangle, and sawtooth waves with adjustable frequency and phase
- **Geometric Shapes** - Circles, squares, stars, hearts, and other Lissajous-style patterns
- **Analog Clock** - A fully functional clock face rendered as audio
- **Custom Drawings** - Draw your own shapes with the path editor
- **SVG Graphics** - Import and animate SVG files, turning vector graphics into audio


## Oscilloscope 

The built-in virtual oscilloscope lets you preview what the generated signals will look like without needing real hardware. It simulates the characteristics of a vintage analog CRT oscilloscope, including phosphor glow, beam physics, and the slight imperfections that give these displays their distinctive look.

### Display Modes

- **A** - Shows only Channel A (left audio channel) as a time-domain waveform
- **B** - Shows only Channel B (right audio channel) as a time-domain waveform
- **A/B** - Shows both channels overlaid on the same display
- **X/Y** - Plots Channel A horizontally and Channel B vertically, perfect for Lissajous figures and vector graphics

### Input Sources

- **Generator** - Use the built-in signal generator to create waveforms and shapes
- **Microphone** - Visualize real audio from your microphone

### Controls

The virtual oscilloscope has controls that mirror those found on real analog oscilloscopes:

#### Display Controls

| Control | Description |
|---------|-------------|
| **INTENS** | Intensity/brightness of the electron beam. Higher values create a brighter trace |
| **FOCUS** | Sharpness of the beam. Center position (0) is perfectly focused; moving away from center blurs the trace |

#### Time Base Controls

| Control | Description |
|---------|-------------|
| **X POS** | Horizontal position of the trace on screen |
| **TIME/DIV** | Time per horizontal division. Controls how much time is shown across the screen. Lower values show faster signals, higher values show slower signals. Has both coarse (stepped) and fine adjustment |
| **TRIGGER** | Sets the voltage level that starts each sweep. The A/B buttons select which channel triggers the sweep. Proper triggering creates a stable, non-scrolling display |

#### Channel A & B Controls

Each channel has identical controls:

| Control | Description |
|---------|-------------|
| **POSITION** | Vertical position of that channel's trace |
| **AMPL/DIV** | Amplitude (voltage) per vertical division. Controls vertical scaling—lower values zoom in on small signals, higher values fit larger signals on screen. Has both coarse (stepped) and fine adjustment |

#### Understanding the Labels

- **DIV** = Division (one grid square on the display)
- **TIME/DIV** = How much time each horizontal grid square represents (e.g., 1ms/div means each square = 1 millisecond)
- **AMPL/DIV** = How much voltage each vertical grid square represents (e.g., 0.1V/div means each square = 0.1 volts)
- **µs** = Microseconds (millionths of a second)
- **ms** = Milliseconds (thousandths of a second)
- **mV** = Millivolts (thousandths of a volt)
- **V** = Volts

### Realistic CRT Simulation

The oscilloscope display doesn't just plot points—it simulates the physics of an actual electron beam:

#### Electromagnetic Deflection Model

Real CRT oscilloscopes use electromagnetic coils to steer the electron beam. These coils have inductance, which causes the beam to overshoot and ring when the signal changes direction quickly. The simulation models:

- **Coil inductance** causing beam overshoot on sharp transitions
- **Electrical resistance** providing damping to settle the oscillations  
- **Beam inertia** from the electromagnetic system's response time

This creates the characteristic "ringing" you see on real oscilloscopes when displaying square waves or sharp corners.

#### Phosphor Display

The rendering simulates how phosphor screens work:

- **Time-based segmentation** - The beam trace is divided into fixed time intervals, so fast-moving sections appear dimmer (the beam spends less time exciting the phosphor)
- **Direction change highlighting** - When the beam reverses direction, it dwells longer at that point, creating brighter spots at corners and wave peaks
- **Smooth interpolation** - Catmull-Rom splines create smooth curves between sample points

## License

MIT
