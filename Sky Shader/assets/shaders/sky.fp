
varying  highp  vec3 vWorldPosition;
varying  highp  vec3 vSunDirection;
varying  highp  float vSunfade;
varying  highp  vec3 vBetaR;
varying  highp  vec3 vBetaM;
varying  highp  float vSunE;

// uniform float time;
// uniform float coverage;
// uniform float cloudHeight;
// uniform float luminance;
uniform highp vec4 fparams;
uniform highp vec4 cameraPos;

//uniform float mieDirectionalG;
const highp  float mieDirectionalG 	= 0.8;
const highp  int OCTAVES  			= 6;

highp float randv(highp vec2 n) { 
	return fract(sin(dot(n, highp vec2(12.9898, 4.1414))) * 43758.5453);
}

highp float rand(highp float n){return fract(sin(n) * 43758.5453123);}

highp float noise(highp float p){
	highp float fl = floor(p);
	highp float fc = fract(p);
	return mix(rand(fl), rand(fl + 1.0), fc);
}

highp float noise(highp vec2 n) {
	const vec2 d = highp vec2(0.0, 1.0);
	highp vec2 b = floor(n), f = smoothstep(highp vec2(0.0), highp vec2(1.0), fract(n));
	return mix(mix(randv(b), randv(b + d.yx), f.x), mix(randv(b + d.xy), randv(b + d.yy), f.x), f.y);
}

highp float fbm(highp vec2 pos, highp float T)
{
	highp float accum = .0;
	highp float amp = 0.6;

	for(int i = 0; i < OCTAVES; i++)
	{
		highp vec2 c = highp vec2(1.);
		accum+= amp* noise(pos-0.9*c);
		pos *= 2.31;
		pos -= highp vec2(.6,0.2)*(T/amp);
		amp = amp*.5;
	}	
	return accum;
}

highp vec3 clouds( highp vec2 vUv , highp vec3 skycol, highp float blend, highp float T ) {
	highp vec2 p = vUv;
	highp float coverage = fparams.y;

	highp float w = fbm(p*1.+T+.05, T);
	w=min(max(0.,w-coverage)*(1./coverage) ,1.);

	highp float v = 1.*fbm(p*1.+T, T);
	v=max(0.,v-coverage*coverage);
	highp float cov = (coverage * 0.5 + 0.5);
	highp vec3 col = min( (skycol+highp vec3(1.,.9,.4)*w* cov * blend),1.);

	col = mix(col,highp vec3(.3,.4,.5)*v*v*.1+cov,v * blend);
	return col;
}

// constants for atmospheric scattering
const highp  float pi 	= 3.141592653589793238462643383279502884197169;

//const  float n 		= 1.0003; // refractive index of air
//const  float N 		= 2.545E25; // number of molecules per unit volume for air at
// 288.15K and 1013mb (sea level -45 celsius)

// optical length at zenith for molecules
const highp  float rayleighZenithLength 	= 8.4E3;
const highp  float mieZenithLength 		= 1.25E3;
const highp  vec3 up 						= highp vec3( 0.0, 1.0, 0.0 );
// 66 arc seconds -> degrees, and the cosine of that
const highp  float sunAngularDiameterCos 	= 0.999556676946448443553574619906976478926848692873900859324;

// 3.0 / ( 16.0 * pi )
const highp  float THREE_OVER_SIXTEENPI 	= 0.05968310365946075;
// 1.0 / ( 4.0 * pi )
const highp  float ONE_OVER_FOURPI 		= 0.07957747154594767;

highp float rayleighPhase(  float cosTheta ) {
	return THREE_OVER_SIXTEENPI * ( 1.0 + pow( cosTheta, 2.0 ) );
}

highp float hgPhase(  float cosTheta,  float g ) {
	highp float g2 = pow( g, 2.0 );
	highp float inverse = 1.0 / pow( 1.0 - 2.0 * g * cosTheta + g2, 1.5 );
	return ONE_OVER_FOURPI * ( ( 1.0 - g2 ) * inverse );
}

// Filmic ToneMapping http://filmicgames.com/archives/75
const highp  float A = 0.15;
const highp  float B = 0.50;
const highp  float C = 0.10;
const highp  float D = 0.20;
const highp  float E = 0.02;
const highp  float F = 0.30;

const highp float whiteScale = 1.0748724675633854;

highp vec3 Uncharted2Tonemap( highp  vec3 x ) {
	return ( ( x * ( A * x + C * B ) + D * E ) / ( x * ( A * x + B ) + D * F ) ) - E / F;
}


highp vec3 filmicToneMapping(highp vec3 color)
{
	color = max(highp vec3(0.), color - highp vec3(0.004));
	color = (color * (6.2 * color + .5)) / (color * (6.2 * color + 1.7) + 0.06);
	return color;
}

void main() {
	// This slows time a little to make the cloud movement a little less "rushed"
	highp float T = fparams.x*.1;
	highp float cloudHeight = fparams.z;
	highp vec3 direction 	= normalize( vWorldPosition - cameraPos.xyz );
		
	// optical length
	// cutoff angle at 90 to avoid singularity in next formula.
	highp float zenithAngle = acos( max( 0.0, dot( up, direction ) ) );
	highp float inverse 	= 1.0 / ( cos( zenithAngle ) + 0.15 * pow( 93.885 - ( ( zenithAngle * 180.0 ) / pi ), -1.253 ) );
	highp float sR 		= rayleighZenithLength * inverse;
	highp float sM 		= mieZenithLength * inverse;

	// combined extinction factor
	highp vec3 Fex 		= exp( -( vBetaR * sR + vBetaM * sM ) );

	// in scattering
	highp float cosTheta 	= dot( direction, vSunDirection );
	highp float rPhase 	= rayleighPhase( cosTheta * 0.5 + 0.5 );
	highp vec3 betaRTheta = vBetaR * rPhase;

	highp float mPhase 	= hgPhase( cosTheta, mieDirectionalG );
	highp vec3 betaMTheta = vBetaM * mPhase;

	highp vec3 betaT = ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM );
	highp vec3 Lin = pow( vSunE * betaT * ( 1.0 - Fex ), highp vec3( 1.5 ) );
	highp float mixVal = clamp( pow( 1.0 - dot( up, vSunDirection ), 5.0 ), 0.0, 1.0 );
	Lin *= mix( highp vec3( 1.0 ), pow( vSunE * betaT * Fex, highp vec3( 0.5 ) ), mixVal );

	// nightsky
	highp float theta 	= acos( direction.y ); // elevation --> y-axis, [-pi/2, pi/2]
	highp float phi 		= atan( direction.z, direction.x ); // azimuth --> x-axis [-pi/2, pi/2]
	highp vec2 uv 		= highp vec2( phi, theta ) / highp vec2( 2.0 * pi, pi ) + highp vec2( 0.5, 0.0 );
	highp vec3 L0 		= highp vec3( 0.1 ) * Fex;

	// composition + solar disc
	highp float sundisk 	= smoothstep( sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta );
	L0 += ( vSunE * 190000.0 * Fex ) * sundisk;

	highp vec3 texColor 	= ( Lin + L0 ) * 0.04 + highp vec3( 0.0, 0.0003, 0.00075 );
	
	highp vec3 curr 		= Uncharted2Tonemap(  texColor * fparams.w );
	highp vec3 color 		= curr * whiteScale;

	highp vec3 retColor 	= pow( color, highp vec3( 1.0 / ( 1.2 + ( 1.2 * vSunfade ) ) ) );
	highp float thetadiff = 1.0 - theta / (pi * 0.5);

	// Use world object to cal projected sphere to planar
	highp float slopeX 	= (vWorldPosition.x / vWorldPosition.y);
	highp float slopeZ 	= (vWorldPosition.z / vWorldPosition.y);
	highp float xpos 		= slopeX * cloudHeight;
	highp float zpos 		= slopeZ * cloudHeight;
	highp vec3 vCloudPosition = highp vec3(xpos, vWorldPosition.y, zpos);
	highp vec2 pos 		= highp vec2(vCloudPosition.x * 0.002, vCloudPosition.z * 0.002);
	highp float blendheight = cloudHeight;
	highp float test 		= (cloudHeight - blendheight);
	
	if (vCloudPosition.y > cloudHeight ) {
		retColor = clouds( pos, retColor, 1.0, T); 
	} else if( vCloudPosition.y > test ) {
		retColor = clouds( pos, retColor, ( vCloudPosition.y - test )/blendheight * 1.5, T); 
	}
	gl_FragColor = highp vec4( retColor * vSunfade * 1.15, 1.0 );
}
