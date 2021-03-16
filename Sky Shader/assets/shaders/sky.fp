// varying mediump vec4 position;
// varying mediump vec2 var_texcoord0;
// 
// uniform lowp sampler2D texture_sampler;
// uniform lowp vec4 tint;
// 
// void main()
// {
// 	// Pre-multiply alpha since all runtime textures already are
// 	lowp vec4 tint_pm = vec4(tint.xyz * tint.w, tint.w);
// 	gl_FragColor = texture2D(texture_sampler, var_texcoord0.xy) * tint_pm;
// }
// 

varying vec3 vWorldPosition;
varying vec3 vSunDirection;
varying float vSunfade;
varying vec3 vBetaR;
varying vec3 vBetaM;
varying float vSunE;

#define OCTAVES 6
// uniform float time;
// uniform float coverage;
// uniform float cloudHeight;
// uniform float luminance;
uniform vec4 fparams;
uniform vec4 cameraPos;

//uniform float mieDirectionalG;
const float mieDirectionalG = 0.8;

float T;
float rand(vec2 n) { 
	return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
}

float rand(float n){return fract(sin(n) * 43758.5453123);}

float noise(float p){
	float fl = floor(p);
	float fc = fract(p);
	return mix(rand(fl), rand(fl + 1.0), fc);
}

float noise(vec2 n) {
	const vec2 d = vec2(0.0, 1.0);
	vec2 b = floor(n), f = smoothstep(vec2(0.0), vec2(1.0), fract(n));
	return mix(mix(rand(b), rand(b + d.yx), f.x), mix(rand(b + d.xy), rand(b + d.yy), f.x), f.y);
}

float fbm(vec2 pos)
{
	float accum = .0;
	float amp = 0.6;

	for(int i = 0; i < OCTAVES; i++)
	{
		vec2 c = vec2(1.);
		accum+= amp* noise(pos-0.9*c);
		pos *= 2.31;
		pos -= vec2(.6,0.2)*(T/amp);
		amp = amp*.5;
	}	
	return accum;
}

vec3 clouds( vec2 vUv , vec3 skycol, float blend ) {
	vec2 p = vUv;
	float coverage = fparams.y;

	float w = fbm(p*1.+T+.05);
	w=min(max(0.,w-coverage)*(1./coverage) ,1.);

	float v = 1.*fbm(p*1.+T);	
	v=max(0.,v-coverage*coverage);
	float cov = (coverage * 0.5 + 0.5);
	vec3 col = min( (skycol+vec3(1.,.9,.4)*w* cov * blend),1.);

	col = mix(col,vec3(.3,.4,.5)*v*v*.1+cov,v * blend);
	return col;
}

// constants for atmospheric scattering
const float pi = 3.141592653589793238462643383279502884197169;

const float n = 1.0003; // refractive index of air
const float N = 2.545E25; // number of molecules per unit volume for air at
// 288.15K and 1013mb (sea level -45 celsius)

// optical length at zenith for molecules
const float rayleighZenithLength = 8.4E3;
const float mieZenithLength = 1.25E3;
const vec3 up = vec3( 0.0, 1.0, 0.0 );
// 66 arc seconds -> degrees, and the cosine of that
const float sunAngularDiameterCos = 0.999556676946448443553574619906976478926848692873900859324;

// 3.0 / ( 16.0 * pi )
const float THREE_OVER_SIXTEENPI = 0.05968310365946075;
// 1.0 / ( 4.0 * pi )
const float ONE_OVER_FOURPI = 0.07957747154594767;

float rayleighPhase( float cosTheta ) {
	return THREE_OVER_SIXTEENPI * ( 1.0 + pow( cosTheta, 2.0 ) );
}

float hgPhase( float cosTheta, float g ) {
	float g2 = pow( g, 2.0 );
	float inverse = 1.0 / pow( 1.0 - 2.0 * g * cosTheta + g2, 1.5 );
	return ONE_OVER_FOURPI * ( ( 1.0 - g2 ) * inverse );
}

// Filmic ToneMapping http://filmicgames.com/archives/75
const float A = 0.15;
const float B = 0.50;
const float C = 0.10;
const float D = 0.20;
const float E = 0.02;
const float F = 0.30;

const float whiteScale = 1.0748724675633854; // 1.0 / Uncharted2Tonemap(1000.0)

vec3 Uncharted2Tonemap( vec3 x ) {
	return ( ( x * ( A * x + C * B ) + D * E ) / ( x * ( A * x + B ) + D * F ) ) - E / F;
}

void main() {
	// This slows time a little to make the cloud movement a little less "rushed"
	T = fparams.x*.1;
	float cloudHeight = fparams.z;
	
	// optical length
	// cutoff angle at 90 to avoid singularity in next formula.
	float zenithAngle = acos( max( 0.0, dot( up, normalize( vWorldPosition - cameraPos.xyz ) ) ) );
	float inverse = 1.0 / ( cos( zenithAngle ) + 0.15 * pow( 93.885 - ( ( zenithAngle * 180.0 ) / pi ), -1.253 ) );
	float sR = rayleighZenithLength * inverse;
	float sM = mieZenithLength * inverse;

	// combined extinction factor
	vec3 Fex = exp( -( vBetaR * sR + vBetaM * sM ) );

	// in scattering
	float cosTheta = dot( normalize( vWorldPosition - cameraPos.xyz ), vSunDirection );

	float rPhase = rayleighPhase( cosTheta * 0.5 + 0.5 );
	vec3 betaRTheta = vBetaR * rPhase;

	float mPhase = hgPhase( cosTheta, mieDirectionalG );
	vec3 betaMTheta = vBetaM * mPhase;

	vec3 Lin = pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * ( 1.0 - Fex ), vec3( 1.5 ) );
	Lin *= mix( vec3( 1.0 ), pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * Fex, vec3( 1.0 / 2.0 ) ), clamp( pow( 1.0 - dot( up, vSunDirection ), 5.0 ), 0.0, 1.0 ) );

	// nightsky
	vec3 direction = normalize( vWorldPosition - cameraPos.xyz );
	float theta = acos( direction.y ); // elevation --> y-axis, [-pi/2, pi/2]
	float phi = atan( direction.z, direction.x ); // azimuth --> x-axis [-pi/2, pi/2]
	vec2 uv = vec2( phi, theta ) / vec2( 2.0 * pi, pi ) + vec2( 0.5, 0.0 );
	vec3 L0 = vec3( 0.1 ) * Fex;

	// composition + solar disc
	float sundisk = smoothstep( sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta );
	L0 += ( vSunE * 19000.0 * Fex ) * sundisk;

	vec3 texColor = ( Lin + L0 ) * 0.04 + vec3( 0.0, 0.0003, 0.00075 );

	vec3 curr = Uncharted2Tonemap(  fparams.w * texColor );
	vec3 color = curr * whiteScale;

	vec3 retColor = pow( color, vec3( 1.0 / ( 1.2 + ( 1.2 * vSunfade ) ) ) );
	float thetadiff = 1.0 - theta / (pi * 0.5);

	// Use world object to cal projected sphere to planar
	float slopeX = (vWorldPosition.x / vWorldPosition.y);
	float slopeZ = (vWorldPosition.z / vWorldPosition.y);
	float xpos = slopeX * cloudHeight;
	float zpos = slopeZ * cloudHeight;
	vec3 vCloudPosition = vec3(xpos, vWorldPosition.y, zpos);
	vec2 pos = vec2(vCloudPosition.x * 0.001, vCloudPosition.z * 0.001);
	float blendheight = cloudHeight;
	float test = (cloudHeight - blendheight);
	if (vCloudPosition.y > cloudHeight ) {
		retColor = clouds( pos, retColor, 1.0); 
	} else if( vCloudPosition.y > test ) {
		retColor = clouds( pos, retColor, ( vCloudPosition.y - test )/blendheight); 
	}
	gl_FragColor = vec4( retColor * vSunfade * 1.2, 1.0 );
}